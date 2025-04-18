var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Connection, PublicKey, } from "@solana/web3.js";
import { JupiterTokenListApi } from "./jupiter-token-list-api";
import { MeteoraDlmmApi } from "./meteora-dlmm-api";
import { parseMeteoraInstructions, } from "./meteora-instruction-parser";
import { ParsedTransactionStream } from "./solana-transaction-utils";
import { delay } from "./util";
export default class MeteoraDownloader {
    get downloadComplete() {
        return this.positionsComplete && !this._fetchingUsd;
    }
    get positionsComplete() {
        return (this._isDone &&
            !this._fetchingMissingPairs &&
            !this._fetchingMissingTokens);
    }
    constructor(db, config) {
        var _a;
        this._gotNewest = false;
        this._fetchingMissingPairs = false;
        this._fetchingMissingTokens = false;
        this._fetchingUsd = false;
        this._isDone = false;
        this._finished = false;
        this._accountSignatureCount = 0;
        this._positionTransactionIds = new Set();
        this._positionAddresses = new Set();
        this._usdPositionAddresses = new Set();
        this._isComplete = false;
        this._transactionDownloadCancelled = false;
        this._fullyCancelled = false;
        this._oldestSignature = "";
        this._oldestBlocktime = 0;
        this._config = config;
        this._connection = new Connection(config.endpoint, config);
        this._db = db;
        this._onDone = (_a = config.callbacks) === null || _a === void 0 ? void 0 : _a.onDone;
        this._startTime = Date.now();
        this._init(config);
    }
    _init(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (config.account.length >= 43 && config.account.length <= 44) {
                this._account = config.account;
            }
            else {
                this._connection = new Connection(config.endpoint, config);
                const signatureMatch = config.account.match(/\w+$/);
                if (!signatureMatch || (signatureMatch === null || signatureMatch === void 0 ? void 0 : signatureMatch.length) == 0) {
                    throw new Error(`${config.account} is not a valid account or transaction signature`);
                }
                const signature = signatureMatch[0];
                const parsedTransaction = yield this._connection.getParsedTransaction(signature);
                const instructions = parseMeteoraInstructions(parsedTransaction);
                if (instructions.length == 0) {
                    throw new Error(`${config.account} is not a Meteora DLMM transaction`);
                }
                this._account = instructions[0].accounts.position;
            }
            if (config.throttleParameters) {
                if (config.throttleParameters.meteoraDlmm) {
                    MeteoraDlmmApi.updateThrottleParameters(config.throttleParameters.meteoraDlmm);
                }
                if (config.throttleParameters.jupiterTokenList) {
                    JupiterTokenListApi.updateThrottleParameters(config.throttleParameters.jupiterTokenList);
                }
            }
            this._isComplete = yield this._db.isComplete(this._account);
            this._stream = ParsedTransactionStream.stream(Object.assign(Object.assign({}, config), { oldestDate: new Date("11/06/2023"), oldestSignature: !this._isComplete
                    ? yield this._db.getOldestSignature(this._account)
                    : undefined, mostRecentSignature: yield this._db.getMostRecentSignature(this._account), onSignaturesReceived: (signatures) => this._onNewSignaturesReceived(signatures), onParsedTransactionsReceived: (transactions) => this._loadInstructions(transactions), onDone: () => {
                    this._isDone = true;
                    this._fetchMissingPairs();
                } }));
        });
    }
    stats() {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                downloadingComplete: this.downloadComplete,
                positionsComplete: this.positionsComplete,
                transactionDownloadCancelled: this._transactionDownloadCancelled,
                fullyCancelled: this._fullyCancelled,
                secondsElapsed: (Date.now() - this._startTime) / 1000,
                accountSignatureCount: this._accountSignatureCount,
                positionCount: this._positionAddresses.size,
                positionTransactionCount: this._positionTransactionIds.size,
                usdPositionCount: this._usdPositionAddresses.size,
                missingUsd: (yield this._db.getMissingUsd()).length,
                oldestTransactionDate: this._oldestTransactionDate,
            };
        });
    }
    _loadInstructions(transactions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._transactionDownloadCancelled) {
                return this._fetchUsd();
            }
            let instructionCount = 0;
            const start = Date.now();
            transactions.forEach((transaction) => {
                parseMeteoraInstructions(transaction).forEach((instruction) => __awaiter(this, void 0, void 0, function* () {
                    if (this._transactionDownloadCancelled) {
                        return this._fetchUsd();
                    }
                    instructionCount++;
                    if (instruction.accounts.lbPair == "") {
                        yield this._addMissingLbPair(instruction);
                    }
                    yield this._db.addInstruction(instruction);
                    this._positionAddresses.add(instruction.accounts.position);
                    this._positionTransactionIds.add(instruction.signature);
                }));
            });
            const elapsed = Date.now() - start;
            console.log(`Downloaded ${instructionCount} instructions in ${elapsed}ms`);
            this._fetchMissingPairs();
        });
    }
    _addMissingLbPair(instruction) {
        return __awaiter(this, void 0, void 0, function* () {
            while (instruction.accounts.lbPair == "") {
                const lbPair = yield this._db.getLbPair(instruction.accounts.position);
                if (lbPair) {
                    instruction.accounts.lbPair = lbPair;
                }
                else {
                    yield delay(1);
                }
            }
        });
    }
    _onNewSignaturesReceived(signatures) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._oldestBlocktime > 0) {
                yield this._db.setOldestSignature(this._account, this._oldestBlocktime, this._oldestSignature);
            }
            this._accountSignatureCount += signatures.length;
            const newest = !this._gotNewest ? signatures[0].signature : undefined;
            this._gotNewest = true;
            this._oldestBlocktime = signatures[signatures.length - 1].blockTime;
            this._oldestSignature = signatures[signatures.length - 1].signature;
            this._oldestTransactionDate = new Date(this._oldestBlocktime * 1000);
            const oldestDate = this._oldestTransactionDate.toDateString();
            const elapsed = Math.round((Date.now() - this._startTime) / 1000);
            console.log(`${elapsed}s - ${newest ? `Newest transaction: ${newest}, ` : ""}Oldest transaction (${oldestDate}): ${this._oldestSignature}`);
        });
    }
    _fetchMissingPairs() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._fetchingMissingPairs || this._transactionDownloadCancelled) {
                return this._fetchUsd();
            }
            let missingPairs = yield this._db.getMissingPairs();
            if (missingPairs.length > 0) {
                this._fetchingMissingPairs = true;
                while (missingPairs.length > 0) {
                    const address = missingPairs.shift();
                    if (address) {
                        const missingPair = yield MeteoraDlmmApi.getDlmmPairData(address);
                        if (this._transactionDownloadCancelled) {
                            return this._fetchUsd();
                        }
                        if (missingPair) {
                            yield this._db.addPair(missingPair);
                            console.log(`Added missing pair for ${missingPair.name}`);
                        }
                        else {
                            console.error(`Unable to obtain data for pair at ${address}`);
                        }
                        if (this._transactionDownloadCancelled) {
                            return this._fetchUsd();
                        }
                        missingPairs = yield this._db.getMissingPairs();
                    }
                }
                this._fetchingMissingPairs = false;
            }
            this._fetchMissingTokens();
        });
    }
    _fetchMissingTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._fetchingMissingTokens || this._transactionDownloadCancelled) {
                return this._fetchUsd();
            }
            let missingTokens = yield this._db.getMissingTokens();
            if (missingTokens.length > 0) {
                this._fetchingMissingTokens = true;
                while (missingTokens.length > 0) {
                    const address = missingTokens.shift();
                    if (address) {
                        let missingToken = yield JupiterTokenListApi.getToken(address);
                        if (missingToken == null) {
                            missingToken = yield this._getMissingToken(address);
                        }
                        if (this._transactionDownloadCancelled) {
                            return this._fetchUsd();
                        }
                        yield this._db.addToken(missingToken);
                        console.log(`Added missing token ${missingToken.symbol}`);
                    }
                    if (this._transactionDownloadCancelled) {
                        return this._fetchUsd();
                    }
                    missingTokens = yield this._db.getMissingTokens();
                }
                this._fetchingMissingTokens = false;
            }
            this._fetchUsd();
        });
    }
    _getMissingToken(address) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._connection) {
                this._connection = new Connection(this._config.endpoint, this._config);
            }
            const tokenData = yield this._connection.getParsedAccountInfo(new PublicKey(address));
            if (tokenData.value &&
                tokenData.value.data &&
                "parsed" in tokenData.value.data) {
                return {
                    address,
                    name: tokenData.value.data.parsed.info.name || null,
                    symbol: tokenData.value.data.parsed.info.symbol || null,
                    decimals: tokenData.value.data.parsed.info.decimals,
                    logoURI: tokenData.value.data.parsed.info.logoURI || null,
                };
            }
            throw new Error(`Token mint ${address} was not found`);
        });
    }
    _fetchUsd() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._fetchingUsd || this._fullyCancelled) {
                return;
            }
            let missingUsd = yield this._db.getMissingUsd();
            if (missingUsd.length > 0) {
                this._fetchingUsd = true;
                while (missingUsd.length > 0) {
                    const address = missingUsd.shift();
                    if (address) {
                        this._usdPositionAddresses.add(address);
                        const usd = yield MeteoraDlmmApi.getTransactions(address);
                        if (this._fullyCancelled) {
                            return;
                        }
                        yield this._db.addUsdTransactions(address, usd);
                        const elapsed = Math.round((Date.now() - this._startTime) / 1000);
                        console.log(`${elapsed}s - Added USD transactions for position ${address}`);
                    }
                    if (this._fullyCancelled) {
                        return;
                    }
                    missingUsd = yield this._db.getMissingUsd();
                    if (missingUsd.length > 0) {
                        console.log(`${missingUsd.length} positions remaining to load USD`);
                    }
                }
                this._fetchingUsd = false;
            }
            this._finish();
        });
    }
    _finish() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.downloadComplete && !this._fullyCancelled && !this._finished) {
                this._finished = true;
                if (!this._transactionDownloadCancelled) {
                    yield this._db.markComplete(this._account);
                }
                yield this._db.save();
                if (this._onDone) {
                    this._onDone();
                }
            }
        });
    }
    cancel() {
        if (this._transactionDownloadCancelled) {
            this._fullyCancelled = true;
        }
        else {
            this._transactionDownloadCancelled = true;
            this._stream.cancel();
        }
    }
}
//# sourceMappingURL=meteora-dlmm-downloader.js.map