import {
  Connection,
  PublicKey,
  type AccountMeta,
  type ConfirmedSignatureInfo,
  type ConnectionConfig,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { MeteoraDownloaderConfig } from "./meteora-dlmm-downloader";
import { ApiThrottle, chunkArray } from "./util";

const CHUNK_SIZE = 250;

export interface TokenTransferInfo {
  mint: string;
  amount: number;
}

export interface ParsedTransferInstruction extends ParsedInstruction {
  parsed: {
    info: {
      authority: string;
      destination: string;
      mint: string;
      source: string;
      tokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string;
      };
    };
    type: "transferChecked";
  };
}

export function getInstructionIndex(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction,
): number {
  const index =
    transaction.transaction.message.instructions.indexOf(instruction);

  if (index != -1) {
    return index;
  }

  if (transaction.meta?.innerInstructions) {
    const outerInstruction = transaction.meta.innerInstructions.find(
      (innerInstruction) =>
        innerInstruction.instructions.find((i) => i == instruction),
    );

    if (outerInstruction) {
      return outerInstruction.index;
    }

    return -1;
  }

  return -1;
}

export function getAccountMetas(
  transaction: ParsedTransactionWithMeta,
  instruction: PartiallyDecodedInstruction,
): AccountMeta[] {
  const accounts = instruction.accounts;
  return accounts
    .map((account) => {
      const data = transaction.transaction.message.accountKeys.find(
        (key) => key.pubkey.toBase58() == account.toBase58(),
      );
      if (data) {
        const { pubkey, signer: isSigner, writable: isWritable } = data;

        return {
          pubkey,
          isSigner,
          isWritable,
        };
      }
      return null;
    })
    .filter((meta) => meta !== null);
}

export function getTokenTransfers(
  transaction: ParsedTransactionWithMeta,
  index: number,
): TokenTransferInfo[] {
  if (index == -1) {
    return [];
  }

  const instruction = transaction.meta?.innerInstructions?.find(
    (i) => i.index == index,
  );

  if (instruction == undefined) {
    return [];
  }

  const transfers = instruction.instructions.filter(
    (i) =>
      "program" in i &&
      i.program == "spl-token" &&
      "parsed" in i &&
      i.parsed.type == "transferChecked",
  ) as ParsedTransferInstruction[];

  if (transfers.length == 0) {
    return [];
  }

  return transfers.map((transfer) => {
    const { mint, tokenAmount } = transfer.parsed.info;
    const { uiAmount: amount } = tokenAmount;

    return {
      mint,
      amount,
    };
  });
}

interface ParsedTransactionStreamConfig extends MeteoraDownloaderConfig {
  onParsedTransactionsReceived: (
    transactions: (ParsedTransactionWithMeta | null)[],
  ) => Promise<any>;
  onSignaturesReceived?: (signatures: ConfirmedSignatureInfo[]) => Promise<any>;
  onDone?: () => any;
  mostRecentSignature?: string;
  oldestSignature?: string;
  oldestDate?: Date;
}

export class ParsedTransactionStream {
  private _account: PublicKey;
  private _connection: Connection;
  private _cancelled = false;
  private _mostRecentSignature?: string;
  private _oldestSignature?: string;
  private _oldestDate?: Date;
  private _currentSignatures: ConfirmedSignatureInfo[] = [];
  private _chunkSize: number;
  private static _apiThrottle: ApiThrottle;
  private _onParsedTransactionsReceived: (
    transactions: (ParsedTransactionWithMeta | null)[],
  ) => Promise<any>;
  private _onSignaturesReceived?: (
    signatures: ConfirmedSignatureInfo[],
  ) => Promise<any>;
  private _onDone?: () => any;

  get cancelled(): boolean {
    return this._cancelled;
  }

  private constructor(config: ParsedTransactionStreamConfig) {
    this._account = new PublicKey(config.account);
    this._connection = new Connection(config.endpoint, config);
    this._mostRecentSignature = config?.mostRecentSignature;
    this._oldestSignature = config?.oldestSignature;
    this._oldestDate = config?.oldestDate;
    this._chunkSize = config?.chunkSize || CHUNK_SIZE;
    if (!ParsedTransactionStream._apiThrottle) {
      ParsedTransactionStream._apiThrottle = new ApiThrottle(
        config?.throttleParameters?.rpc?.max || Infinity,
        config?.throttleParameters?.rpc?.interval || 0,
      );
    }
    this._onParsedTransactionsReceived = config.onParsedTransactionsReceived;
    this._onSignaturesReceived = config.onSignaturesReceived;
    this._onDone = config.onDone;
  }

  static stream(
    config: ParsedTransactionStreamConfig,
  ): ParsedTransactionStream {
    const stream = new ParsedTransactionStream(config);
    stream._stream();
    return stream;
  }

  private async _stream(): Promise<void> {
    let validSignatures: ConfirmedSignatureInfo[] = [];
    let before = this._mostRecentSignature ? undefined : this._oldestSignature;

    do {
      this._currentSignatures =
        await ParsedTransactionStream._apiThrottle.processItem(
          before,
          (before) => this._getSignaturesForAddress(before),
        );
      if (this._currentSignatures.length == 0) {
        continue;
      }
      const newValidSignatures = this._filterSignatures();
      if (this._onSignaturesReceived && !this._cancelled) {
        await this._onSignaturesReceived(this._currentSignatures);
      }
      validSignatures = validSignatures.concat(newValidSignatures);
      if (validSignatures.length >= this._chunkSize && !this._cancelled) {
        await this._sendParsedTransactions(validSignatures);
        validSignatures = [];
      }

      before = this._before;
    } while (this._continue);
    if (!this._cancelled) {
      await this._sendParsedTransactions(validSignatures);
    }
    if (this._onDone) {
      this._onDone();
    }
  }

  private _getSignaturesForAddress(
    before?: string,
  ): Promise<ConfirmedSignatureInfo[]> {
    return this._connection.getSignaturesForAddress(this._account, {
      before,
    });
  }

  private _filterSignatures(): ConfirmedSignatureInfo[] {
    const signatureStrings = this._currentSignatures.map(
      (signature) => signature.signature,
    );
    if (this._hasMostRecentSignature) {
      return this._currentSignatures
        .slice(0, signatureStrings.indexOf(this._mostRecentSignature!))
        .filter((signature) => !signature.err);
    }

    if (this._hasOldestDate) {
      return this._currentSignatures.filter(
        (signature) =>
          !signature.err &&
          new Date(signature.blockTime! * 1000) >= this._oldestDate!,
      );
    }

    return this._currentSignatures.filter((signature) => !signature.err);
  }

  private async _sendParsedTransactions(
    validSignatures: ConfirmedSignatureInfo[],
  ) {
    if (this._cancelled) {
      return;
    }
    const chunks = chunkArray(validSignatures, Math.ceil(this._chunkSize));
    for (let i = 0; i < chunks.length; i++) {
      const transactions =
        await ParsedTransactionStream._apiThrottle.processItem(
          chunks[i].map((signature) => signature.signature),
          (signatures) => this._getParsedTransactions(signatures),
        );

      if (this._cancelled) {
        return;
      }

      await this._onParsedTransactionsReceived(transactions);
    }
  }

  private _getParsedTransactions(
    validSignatures: string[],
  ): Promise<(ParsedTransactionWithMeta | null)[]> {
    return this._connection.getParsedTransactions(validSignatures, {
      maxSupportedTransactionVersion: 0,
    });
  }

  cancel(): void {
    this._cancelled = true;
  }

  private get _continue(): boolean {
    if (
      this._currentSignatures.length == 0 ||
      this._cancelled ||
      this._hasOldestDate
    ) {
      return false;
    }

    if (this._hasMostRecentSignature && !this._oldestSignature) {
      return false;
    }

    return true;
  }

  private get _hasMostRecentSignature(): boolean {
    return (
      Boolean(this._mostRecentSignature) &&
      this._currentSignatures.some(
        (signature) => signature.signature == this._mostRecentSignature,
      )
    );
  }

  private get _hasOldestDate(): boolean {
    return (
      Boolean(this._oldestDate) &&
      this._currentSignatures.some(
        (signature) =>
          new Date(signature.blockTime! * 1000) < this._oldestDate!,
      )
    );
  }

  private get _before(): string | undefined {
    if (this._hasMostRecentSignature) {
      return this._oldestSignature;
    }

    if (this._currentSignatures.length > 0) {
      return this._currentSignatures[this._currentSignatures.length - 1]
        .signature;
    }

    return undefined;
  }
}
