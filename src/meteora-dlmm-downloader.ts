import {
  Connection,
  ConnectionConfig,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { JupiterTokenListApi, TokenMeta } from "./jupiter-token-list-api";
import { MeteoraDlmmApi } from "./meteora-dlmm-api";
import MeteoraDlmmDb from "./meteora-dlmm-db";
import {
  MeteoraDlmmInstruction,
  parseMeteoraInstructions,
} from "./meteora-instruction-parser";
import { ParsedTransactionStream } from "./solana-transaction-utils";
import { delay } from "./util";

export interface MeteoraDlmmDownloaderStats {
  downloadingComplete: boolean;
  positionsComplete: boolean;
  transactionDownloadCancelled: boolean;
  fullyCancelled: boolean;
  secondsElapsed: number;
  accountSignatureCount: number;
  oldestTransactionDate?: Date;
  positionTransactionCount: number;
  positionCount: number;
  usdPositionCount: number;
  missingUsd: number;
}

export interface MeteoraDownloaderConfig extends ConnectionConfig {
  endpoint: string;
  account: string;
  callbacks?: {
    onDone?: (...args: any[]) => any;
  };
  chunkSize?: number;
  throttleParameters?: {
    rpc?: {
      max: number;
      interval: number;
    };
    meteoraDlmm?: {
      max: number;
      interval: number;
    };
    jupiterTokenList?: {
      max: number;
      interval: number;
    };
  };
}

export default class MeteoraDownloader {
  private _config: MeteoraDownloaderConfig;
  private _db: MeteoraDlmmDb;
  private _connection: Connection;
  private _account!: string;
  private _stream!: ParsedTransactionStream;
  private _gotNewest = false;
  private _oldestTransactionDate?: Date;
  private _fetchingMissingPairs = false;
  private _fetchingMissingTokens = false;
  private _fetchingUsd = false;
  private _onDone?: (...args: any[]) => any;
  private _isDone = false;
  private _finished = false;
  private _startTime: number;
  private _accountSignatureCount = 0;
  private _positionTransactionIds: Set<string> = new Set();
  private _positionAddresses: Set<string> = new Set();
  private _usdPositionAddresses: Set<string> = new Set();
  private _isComplete = false;
  private _transactionDownloadCancelled = false;
  private _fullyCancelled = false;
  private _oldestSignature: string = "";
  private _oldestBlocktime: number = 0;

  get downloadComplete(): boolean {
    return this.positionsComplete && !this._fetchingUsd;
  }

  get positionsComplete(): boolean {
    return (
      this._isDone &&
      !this._fetchingMissingPairs &&
      !this._fetchingMissingTokens
    );
  }

  constructor(db: MeteoraDlmmDb, config: MeteoraDownloaderConfig) {
    this._config = config;
    this._connection = new Connection(config.endpoint, config);
    this._db = db;
    this._onDone = config.callbacks?.onDone;
    this._startTime = Date.now();
    this._init(config);
  }

  private async _init(config: MeteoraDownloaderConfig) {
    if (config.account.length >= 43 && config.account.length <= 44) {
      this._account = config.account;
    } else {
      this._connection = new Connection(config.endpoint, config);
      const signatureMatch = config.account.match(/\w+$/);
      if (!signatureMatch || signatureMatch?.length == 0) {
        throw new Error(
          `${config.account} is not a valid account or transaction signature`,
        );
      }
      const signature = signatureMatch[0];
      const parsedTransaction = await this._connection.getParsedTransaction(
        signature,
      );
      const instructions = parseMeteoraInstructions(parsedTransaction);
      if (instructions.length == 0) {
        throw new Error(`${config.account} is not a Meteora DLMM transaction`);
      }
      this._account = instructions[0].accounts.position;
    }

    if (config.throttleParameters) {
      if (config.throttleParameters.meteoraDlmm) {
        MeteoraDlmmApi.updateThrottleParameters(
          config.throttleParameters.meteoraDlmm,
        );
      }
      if (config.throttleParameters.jupiterTokenList) {
        JupiterTokenListApi.updateThrottleParameters(
          config.throttleParameters.jupiterTokenList,
        );
      }
    }
    this._isComplete = await this._db.isComplete(this._account);
    this._stream = ParsedTransactionStream.stream({
      ...config,
      oldestDate: new Date("11/06/2023"),
      oldestSignature: !this._isComplete
        ? await this._db.getOldestSignature(this._account)
        : undefined,
      mostRecentSignature: await this._db.getMostRecentSignature(this._account),
      onSignaturesReceived: (signatures) =>
        this._onNewSignaturesReceived(signatures),
      onParsedTransactionsReceived: (transactions) =>
        this._loadInstructions(transactions),
      onDone: () => {
        this._isDone = true;
        this._fetchMissingPairs();
      },
    });
  }

  async stats(): Promise<MeteoraDlmmDownloaderStats> {
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
      missingUsd: (await this._db.getMissingUsd()).length,
      oldestTransactionDate: this._oldestTransactionDate,
    };
  }

  private async _loadInstructions(
    transactions: (ParsedTransactionWithMeta | null)[],
  ) {
    if (this._transactionDownloadCancelled) {
      return this._fetchUsd();
    }
    let instructionCount = 0;
    const start = Date.now();
    transactions.forEach((transaction) => {
      parseMeteoraInstructions(transaction).forEach(async (instruction) => {
        if (this._transactionDownloadCancelled) {
          return this._fetchUsd();
        }
        instructionCount++;
        if (instruction.accounts.lbPair == "") {
          await this._addMissingLbPair(instruction);
        }
        await this._db.addInstruction(instruction);
        this._positionAddresses.add(instruction.accounts.position);
        this._positionTransactionIds.add(instruction.signature);
      });
    });
    const elapsed = Date.now() - start;
    console.log(`Downloaded ${instructionCount} instructions in ${elapsed}ms`);
    this._fetchMissingPairs();
  }

  private async _addMissingLbPair(instruction: MeteoraDlmmInstruction) {
    while (instruction.accounts.lbPair == "") {
      const lbPair = await this._db.getLbPair(instruction.accounts.position);
      if (lbPair) {
        instruction.accounts.lbPair = lbPair;
      } else {
        await delay(1);
      }
    }
  }

  private async _onNewSignaturesReceived(signatures: ConfirmedSignatureInfo[]) {
    if (this._oldestBlocktime > 0) {
      await this._db.setOldestSignature(
        this._account,
        this._oldestBlocktime,
        this._oldestSignature,
      );
    }
    this._accountSignatureCount += signatures.length;
    const newest = !this._gotNewest ? signatures[0].signature : undefined;
    this._gotNewest = true;
    this._oldestBlocktime = signatures[signatures.length - 1].blockTime!;
    this._oldestSignature = signatures[signatures.length - 1].signature;
    this._oldestTransactionDate = new Date(this._oldestBlocktime * 1000);
    const oldestDate = this._oldestTransactionDate.toDateString();
    const elapsed = Math.round((Date.now() - this._startTime) / 1000);
    console.log(
      `${elapsed}s - ${
        newest ? `Newest transaction: ${newest}, ` : ""
      }Oldest transaction (${oldestDate}): ${this._oldestSignature}`,
    );
  }

  private async _fetchMissingPairs() {
    if (this._fetchingMissingPairs || this._transactionDownloadCancelled) {
      return this._fetchUsd();
    }
    let missingPairs = await this._db.getMissingPairs();
    if (missingPairs.length > 0) {
      this._fetchingMissingPairs = true;
      while (missingPairs.length > 0) {
        const address = missingPairs.shift();
        if (address) {
          const missingPair = await MeteoraDlmmApi.getDlmmPairData(address);
          if (this._transactionDownloadCancelled) {
            return this._fetchUsd();
          }
          if (missingPair) {
            await this._db.addPair(missingPair);
            console.log(`Added missing pair for ${missingPair.name}`);
          } else {
            console.error(`Unable to obtain data for pair at ${address}`);
          }
          if (this._transactionDownloadCancelled) {
            return this._fetchUsd();
          }
          missingPairs = await this._db.getMissingPairs();
        }
      }
      this._fetchingMissingPairs = false;
    }
    this._fetchMissingTokens();
  }

  private async _fetchMissingTokens() {
    if (this._fetchingMissingTokens || this._transactionDownloadCancelled) {
      return this._fetchUsd();
    }
    let missingTokens = await this._db.getMissingTokens();
    if (missingTokens.length > 0) {
      this._fetchingMissingTokens = true;
      while (missingTokens.length > 0) {
        const address = missingTokens.shift();
        if (address) {
          let missingToken = await JupiterTokenListApi.getToken(address);
          if (missingToken == null) {
            missingToken = await this._getMissingToken(address);
          }
          if (this._transactionDownloadCancelled) {
            return this._fetchUsd();
          }
          await this._db.addToken(missingToken);
          console.log(`Added missing token ${missingToken.symbol}`);
        }
        if (this._transactionDownloadCancelled) {
          return this._fetchUsd();
        }
        missingTokens = await this._db.getMissingTokens();
      }
      this._fetchingMissingTokens = false;
    }
    this._fetchUsd();
  }

  private async _getMissingToken(address: string): Promise<TokenMeta> {
    if (!this._connection) {
      this._connection = new Connection(this._config.endpoint, this._config);
    }
    const tokenData = await this._connection.getParsedAccountInfo(
      new PublicKey(address),
    );
    if (
      tokenData.value &&
      tokenData.value.data &&
      "parsed" in tokenData.value.data
    ) {
      return {
        address,
        name: tokenData.value.data.parsed.info.name || null,
        symbol: tokenData.value.data.parsed.info.symbol || null,
        decimals: tokenData.value.data.parsed.info.decimals,
        logoURI: tokenData.value.data.parsed.info.logoURI || null,
      };
    }
    throw new Error(`Token mint ${address} was not found`);
  }

  private async _fetchUsd() {
    if (this._fetchingUsd || this._fullyCancelled) {
      return;
    }
    let missingUsd = await this._db.getMissingUsd();
    if (missingUsd.length > 0) {
      this._fetchingUsd = true;
      while (missingUsd.length > 0) {
        const address = missingUsd.shift();
        if (address) {
          this._usdPositionAddresses.add(address);
          const usd = await MeteoraDlmmApi.getTransactions(address);
          if (this._fullyCancelled) {
            return;
          }
          await this._db.addUsdTransactions(address, usd);
          const elapsed = Math.round((Date.now() - this._startTime) / 1000);
          console.log(
            `${elapsed}s - Added USD transactions for position ${address}`,
          );
        }
        if (this._fullyCancelled) {
          return;
        }
        missingUsd = await this._db.getMissingUsd();
        if (missingUsd.length > 0) {
          console.log(`${missingUsd.length} positions remaining to load USD`);
        }
      }
      this._fetchingUsd = false;
    }
    this._finish();
  }

  private async _finish() {
    if (this.downloadComplete && !this._fullyCancelled && !this._finished) {
      this._finished = true;
      if (!this._transactionDownloadCancelled) {
        await this._db.markComplete(this._account);
      }
      await this._db.save();
      if (this._onDone) {
        this._onDone();
      }
    }
  }

  cancel() {
    if (this._transactionDownloadCancelled) {
      this._fullyCancelled = true;
    } else {
      this._transactionDownloadCancelled = true;
      this._stream.cancel();
    }
  }
}
