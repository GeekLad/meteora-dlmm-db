import { type AccountMeta, type ConfirmedSignatureInfo, type ParsedInstruction, type ParsedTransactionWithMeta, type PartiallyDecodedInstruction } from "@solana/web3.js";
import { MeteoraDownloaderConfig } from "./meteora-dlmm-downloader";
export declare function getInstructionIndex(transaction: ParsedTransactionWithMeta, instruction: PartiallyDecodedInstruction): number;
export declare function getAccountMetas(transaction: ParsedTransactionWithMeta, instruction: PartiallyDecodedInstruction): AccountMeta[];
export declare function getTokenTransfers(transaction: ParsedTransactionWithMeta, index: number): (ParsedInstruction | PartiallyDecodedInstruction)[];
interface ParsedTransactionStreamConfig extends MeteoraDownloaderConfig {
    onParsedTransactionsReceived: (transactions: (ParsedTransactionWithMeta | null)[]) => Promise<any>;
    onSignaturesReceived?: (signatures: ConfirmedSignatureInfo[]) => Promise<any>;
    onDone?: () => any;
    mostRecentSignature?: string;
    oldestSignature?: string;
    oldestDate?: Date;
}
export declare class ParsedTransactionStream {
    private _account;
    private _connection;
    private _cancelled;
    private _mostRecentSignature?;
    private _oldestSignature?;
    private _oldestDate?;
    private _currentSignatures;
    private _chunkSize;
    private static _apiThrottle;
    private _onParsedTransactionsReceived;
    private _onSignaturesReceived?;
    private _onDone?;
    get cancelled(): boolean;
    private constructor();
    static stream(config: ParsedTransactionStreamConfig): ParsedTransactionStream;
    private _stream;
    private _getSignaturesForAddress;
    private _filterSignatures;
    private _sendParsedTransactions;
    private _getParsedTransactions;
    cancel(): void;
    private get _continue();
    private get _hasMostRecentSignature();
    private get _hasOldestDate();
    private get _before();
}
export {};
