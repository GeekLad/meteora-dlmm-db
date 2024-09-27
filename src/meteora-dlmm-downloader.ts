import {
  Connection,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { JupiterTokenListApi } from "./jupiter-token-list-api";
import { MeteoraDlmmApi } from "./meteora-dlmm-api";
import MeteoraDlmmDb from "./meteora-dlmm-db";
import { parseMeteoraInstructions } from "./meteora-instruction-parser";
import { ParsedTransactionStream } from "./solana-transaction-utils";

interface MeteoraDlmmDownloaderCallbacks {
  onDone?: (...args: any[]) => any;
}

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
}

export default class MeteoraDownloader {
  private _db: MeteoraDlmmDb;
  private _account!: string;
  private _stream!: ParsedTransactionStream;
  private _gotNewest = false;
  private _oldestTransactionDate?: Date;
  private _fetchingMissingPairs = false;
  private _fetchingMissingTokens = false;
  private _fetchingUsd = false;
  private _onDone?: (...args: any[]) => any;
  private _isDone = false;
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

  get stats(): MeteoraDlmmDownloaderStats {
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
      oldestTransactionDate: this._oldestTransactionDate,
    };
  }

  constructor(
    db: MeteoraDlmmDb,
    endpoint: string,
    account: string,
    callbacks?: MeteoraDlmmDownloaderCallbacks,
  ) {
    this._db = db;
    this._onDone = callbacks?.onDone;
    this._startTime = Date.now();
    this._init(endpoint, account);
  }

  private async _init(endpoint: string, account: string) {
    if (account.length >= 43 && account.length <= 44) {
      this._account = account;
    } else {
      const connection = new Connection(endpoint);
      const signatureMatch = account.match(/\w+$/);
      if (!signatureMatch || signatureMatch?.length == 0) {
        throw new Error(
          `${account} is not a valid account or transaction signature`,
        );
      }
      const signature = signatureMatch[0];
      const parsedTransaction = await connection.getParsedTransaction(
        signature,
      );
      const instructions = parseMeteoraInstructions(parsedTransaction);
      if (instructions.length == 0) {
        throw new Error(`${account} is not a Meteora DLMM transaction`);
      }
      this._account = instructions[0].accounts.position;
    }

    this._isComplete = this._db.isComplete(this._account);
    this._stream = ParsedTransactionStream.stream(endpoint, this._account, {
      oldestDate: new Date("11/06/2023"),
      oldestSignature: !this._isComplete
        ? this._db.getOldestSignature(this._account)
        : undefined,
      mostRecentSignature: this._db.getMostRecentSignature(this._account),
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

  private async _loadInstructions(
    transactions: (ParsedTransactionWithMeta | null)[],
  ) {
    if (this._transactionDownloadCancelled) {
      return this._fetchUsd();
    }
    let instructionCount = 0;
    const start = Date.now();
    transactions.forEach((transaction) => {
      parseMeteoraInstructions(transaction).forEach((instruction) => {
        if (this._transactionDownloadCancelled) {
          return this._fetchUsd();
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
  }

  private async _onNewSignaturesReceived(signatures: ConfirmedSignatureInfo[]) {
    if (this._oldestBlocktime > 0) {
      this._db.setOldestSignature(
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
    let missingPairs = this._db.getMissingPairs();
    if (missingPairs.length > 0) {
      this._fetchingMissingPairs = true;
      while (missingPairs.length > 0) {
        const address = missingPairs.shift();
        if (address) {
          const missingPair = await MeteoraDlmmApi.getDlmmPairData(address);
          if (this._transactionDownloadCancelled) {
            return this._fetchUsd();
          }
          this._db.addPair(missingPair);
          console.log(`Added missing pair for ${missingPair.name}`);
          if (this._transactionDownloadCancelled) {
            return this._fetchUsd();
          }
          missingPairs = this._db.getMissingPairs();
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
    let missingTokens = this._db.getMissingTokens();
    if (missingTokens.length > 0) {
      this._fetchingMissingTokens = true;
      while (missingTokens.length > 0) {
        const address = missingTokens.shift();
        if (address) {
          const missingToken = await JupiterTokenListApi.getToken(address);
          if (missingToken) {
            if (this._transactionDownloadCancelled) {
              return this._fetchUsd();
            }
            this._db.addToken(missingToken);
            console.log(`Added missing token ${missingToken.symbol}`);
          } else {
            throw new Error(
              `Token mint ${address} was not found in the Jupiter token list`,
            );
          }
        }
        if (this._transactionDownloadCancelled) {
          return this._fetchUsd();
        }
        missingTokens = this._db.getMissingTokens();
      }
      this._fetchingMissingTokens = false;
    }
    this._fetchUsd();
  }

  private async _fetchUsd() {
    if (this._fetchingUsd || this._fullyCancelled) {
      return;
    }
    let missingUsd = this._db.getMissingUsd();
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
          this._db.addUsdTransactions(address, usd);
          const elapsed = Math.round((Date.now() - this._startTime) / 1000);
          console.log(
            `${elapsed}s - Added USD transactions for position ${address}`,
          );
        }
        if (this._fullyCancelled) {
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
  }

  private async _finish() {
    if (this.downloadComplete && !this._fullyCancelled) {
      this._db.markComplete(this._account);
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
