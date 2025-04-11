import { ConnectionConfig } from "@solana/web3.js";
import MeteoraDlmmDb from "./meteora-dlmm-db";
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
    private _config;
    private _db;
    private _connection;
    private _account;
    private _stream;
    private _gotNewest;
    private _oldestTransactionDate?;
    private _fetchingMissingPairs;
    private _fetchingMissingTokens;
    private _fetchingUsd;
    private _onDone?;
    private _isDone;
    private _finished;
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
    constructor(db: MeteoraDlmmDb, config: MeteoraDownloaderConfig);
    private _init;
    stats(): Promise<MeteoraDlmmDownloaderStats>;
    private _loadInstructions;
    private _addMissingLbPair;
    private _onNewSignaturesReceived;
    private _fetchMissingPairs;
    private _fetchMissingTokens;
    private _getMissingToken;
    private _fetchUsd;
    private _finish;
    cancel(): void;
}
