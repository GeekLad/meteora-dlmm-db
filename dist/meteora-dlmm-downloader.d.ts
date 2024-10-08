import MeteoraDlmmDb from "./meteora-dlmm-db";
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
    missingUsd: number;
}
export default class MeteoraDownloader {
    private _db;
    private _account;
    private _stream;
    private _gotNewest;
    private _oldestTransactionDate?;
    private _fetchingMissingPairs;
    private _fetchingMissingTokens;
    private _fetchingUsd;
    private _onDone?;
    private _isDone;
    private _startTime;
    private _accountSignatureCount;
    private _positionTransactionIds;
    private _positionAddresses;
    private _usdPositionAddresses;
    private _isComplete;
    private _transactionDownloadCancelled;
    private _fullyCancelled;
    private _oldestSignature;
    private _oldestBlocktime;
    get downloadComplete(): boolean;
    get positionsComplete(): boolean;
    constructor(db: MeteoraDlmmDb, endpoint: string, account: string, callbacks?: MeteoraDlmmDownloaderCallbacks);
    private _init;
    stats(): Promise<MeteoraDlmmDownloaderStats>;
    private _loadInstructions;
    private _onNewSignaturesReceived;
    private _fetchMissingPairs;
    private _fetchMissingTokens;
    private _fetchUsd;
    private _finish;
    cancel(): void;
}
export {};
