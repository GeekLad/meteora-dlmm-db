var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { JupiterTokenListApi } from "./jupiter-token-list-api";
import { MeteoraDlmmApi } from "./meteora-dlmm-api";
import { parseMeteoraInstructions } from "./meteora-instruction-parser";
import { ParsedTransactionStream } from "./solana-transaction-utils";
export default class MeteoraDownloaderStream {
    get downloadComplete() {
        return (this._isDone &&
            !this._fetchingMissingPairs &&
            !this._fetchingMissingTokens &&
            !this._fetchingUsd);
    }
    get stats() {
        return {
            downloadingComplete: this.downloadComplete,
            secondsElapsed: (Date.now() - this._startTime) / 1000,
            accountSignatureCount: this._accountSignatureCount,
            positionCount: this._positionAddresses.size,
            positionTransactionCount: this._positionTransactionIds.size,
            usdPositionCount: this._usdPositionAddresses.size,
        };
    }
    constructor(db, endpoint, account, callbacks) {
        this._gotNewest = false;
        this._fetchingMissingPairs = false;
        this._fetchingMissingTokens = false;
        this._fetchingUsd = false;
        this._isDone = false;
        this._accountSignatureCount = 0;
        this._positionTransactionIds = new Set();
        this._positionAddresses = new Set();
        this._usdPositionAddresses = new Set();
        this._isComplete = false;
        this._cancelled = false;
        this._db = db;
        this._account = account;
        this._isComplete = db.isComplete(this._account);
        this._onDone = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onDone;
        this._startTime = Date.now();
        this._stream = ParsedTransactionStream.stream(endpoint, this._account, {
            oldestDate: new Date("11/06/2023"),
            oldestSignature: !this._isComplete
                ? this._db.getOldestSignature(this._account)
                : undefined,
            mostRecentSignature: this._db.getMostRecentSignature(this._account),
            onSignaturesReceived: (signatures) => this._onNewSignaturesReceived(signatures),
            onParsedTransactionsReceived: (transactions) => this._loadInstructions(transactions),
            onDone: () => {
                this._isDone = true;
                this._fetchMissingPairs();
            },
        });
    }
    _loadInstructions(transactions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._cancelled) {
                return;
            }
            let instructionCount = 0;
            const start = Date.now();
            transactions.forEach((transaction) => {
                parseMeteoraInstructions(transaction).forEach((instruction) => {
                    if (this._cancelled) {
                        return;
                    }
                    this._db.addInstruction(instruction);
                    instructionCount++;
                    this._positionAddresses.add(instruction.accounts.position);
                    this._positionTransactionIds.add(instruction.signature);
                });
            });
            const elapsed = Date.now() - start;
            console.log(`Added ${instructionCount} instructions in ${elapsed}ms`);
            this._fetchMissingPairs();
        });
    }
    _onNewSignaturesReceived(signatures) {
        return __awaiter(this, void 0, void 0, function* () {
            this._accountSignatureCount += signatures.length;
            const newest = !this._gotNewest ? signatures[0].signature : undefined;
            this._gotNewest = true;
            const oldestSignature = signatures[signatures.length - 1].signature;
            const oldestDate = new Date(signatures[signatures.length - 1].blockTime * 1000).toDateString();
            const elapsed = Math.round((Date.now() - this._startTime) / 1000);
            console.log(`${elapsed}s - ${newest ? `Newest transaction: ${newest}, ` : ""}Oldest transaction (${oldestDate}): ${oldestSignature}`);
        });
    }
    _fetchMissingPairs() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._fetchingMissingPairs || this._cancelled) {
                return;
            }
            let missingPairs = this._db.getMissingPairs();
            if (missingPairs.length > 0) {
                this._fetchingMissingPairs = true;
                while (missingPairs.length > 0) {
                    const address = missingPairs.shift();
                    if (address) {
                        const missingPair = yield MeteoraDlmmApi.getDlmmPairData(address);
                        if (this._cancelled) {
                            return;
                        }
                        this._db.addPair(missingPair);
                        console.log(`Added missing pair for ${missingPair.name}`);
                        if (this._cancelled) {
                            return;
                        }
                        missingPairs = this._db.getMissingPairs();
                    }
                }
                this._fetchingMissingPairs = false;
            }
            this._fetchMissingTokens();
        });
    }
    _fetchMissingTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._fetchingMissingTokens || this._cancelled) {
                return;
            }
            let missingTokens = this._db.getMissingTokens();
            if (missingTokens.length > 0) {
                this._fetchingMissingTokens = true;
                while (missingTokens.length > 0) {
                    const address = missingTokens.shift();
                    if (address) {
                        const missingToken = yield JupiterTokenListApi.getToken(address);
                        if (missingToken) {
                            if (this._cancelled) {
                                return;
                            }
                            this._db.addToken(missingToken);
                            console.log(`Added missing token ${missingToken.symbol}`);
                        }
                        else {
                            throw new Error(`Token mint ${address} was not found in the Jupiter token list`);
                        }
                    }
                    if (this._cancelled) {
                        return;
                    }
                    missingTokens = this._db.getMissingTokens();
                }
                this._fetchingMissingTokens = false;
            }
            this._fetchUsd();
        });
    }
    _fetchUsd() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._fetchingUsd || this._cancelled) {
                return;
            }
            let missingUsd = this._db.getMissingUsd();
            if (missingUsd.length > 0) {
                this._fetchingUsd = true;
                while (missingUsd.length > 0) {
                    const address = missingUsd.shift();
                    if (address) {
                        this._usdPositionAddresses.add(address);
                        const usd = yield MeteoraDlmmApi.getTransactions(address);
                        if (this._cancelled) {
                            return;
                        }
                        this._db.addUsdTransactions(address, usd);
                        const elapsed = Math.round((Date.now() - this._startTime) / 1000);
                        console.log(`${elapsed}s - Added USD transactions for position ${address}`);
                    }
                    if (this._cancelled) {
                        return;
                    }
                    missingUsd = this._db.getMissingUsd();
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
        if (this._onDone && this.downloadComplete && !this._cancelled) {
            this._db.markComplete(this._account);
            this._onDone();
        }
    }
    cancel() {
        this._cancelled = true;
        this._stream.cancel();
    }
}
//# sourceMappingURL=meteora-dlmm-downloader.js.map