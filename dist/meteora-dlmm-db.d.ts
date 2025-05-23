import { type MeteoraDlmmInstruction } from "./meteora-instruction-parser";
import { type MeteoraDlmmPairData, type MeteoraPositionTransactions } from "./meteora-dlmm-api";
import { type TokenMeta } from "./jupiter-token-list-api";
import MeteoraDlmmDownloader, { MeteoraDownloaderConfig } from "./meteora-dlmm-downloader";
interface MeteoraDlmmDbSchema {
    [column: string]: number | boolean | string | Array<unknown> | Uint8Array | null;
}
export interface MeteoraDlmmDbTransactions extends MeteoraDlmmDbSchema {
    block_time: number;
    is_hawksight: boolean;
    signature: string;
    position_address: string;
    owner_address: string;
    pair_address: string;
    base_mint: string;
    base_symbol: string;
    base_decimals: number;
    base_logo: string;
    quote_mint: string;
    quote_symbol: string;
    quote_decimals: number;
    quote_logo: string;
    is_inverted: number;
    position_is_open: number;
    is_opening_transaction: number;
    is_closing_transaction: number;
    price: number;
    fee_amount: number;
    deposit: number;
    withdrawal: number;
    usd_fee_amount: number;
    usd_deposit: number;
    usd_withdrawal: number;
}
export default class MeteoraDlmmDb {
    private _db;
    private _addInstructionStatement;
    private _addTransferStatement;
    private _addPairStatement;
    private _addTokenStatement;
    private _addUsdYStatement;
    private _addUsdXStatement;
    private _fillMissingUsdStatement;
    private _setOldestSignature;
    private _markCompleteStatement;
    private _getAllTransactions;
    private _downloaders;
    private _saving;
    private _queue;
    delaySave: boolean;
    private constructor();
    static create(data?: ArrayLike<number> | Buffer | null): Promise<MeteoraDlmmDb>;
    static load(): Promise<MeteoraDlmmDb>;
    private _init;
    private _createTables;
    private _createStatements;
    private _addInitialData;
    download(config: MeteoraDownloaderConfig): MeteoraDlmmDownloader;
    addInstruction(instruction: MeteoraDlmmInstruction): Promise<void>;
    addTransfers(instruction: MeteoraDlmmInstruction): Promise<void>;
    getLbPair(position_address: string): Promise<string | undefined>;
    addPair(pair: MeteoraDlmmPairData): Promise<void>;
    addToken(token: TokenMeta): Promise<void>;
    addUsdTransactions(position_address: string, transactions: MeteoraPositionTransactions): Promise<void>;
    setOldestSignature($account_address: string, $oldest_block_time: number, $oldest_signature: string): Promise<void>;
    markComplete($account_address: string): Promise<void>;
    isComplete(account_address: string): Promise<boolean>;
    getMissingPairs(): Promise<string[]>;
    getMissingTokens(): Promise<string[]>;
    getMissingUsd(): Promise<string[]>;
    getMostRecentSignature(owner_address: string): Promise<string | undefined>;
    getOldestSignature(owner_address: string): Promise<string | undefined>;
    getAllTransactions(): Promise<MeteoraDlmmDbTransactions[]>;
    getOwnerTransactions(owner_address: string): Promise<MeteoraDlmmDbTransactions[]>;
    cancelDownload(account: string): Promise<void>;
    private _getAll;
    private _queueDbCall;
    private _processQueue;
    save(): Promise<void>;
    private _waitUntilReady;
    waitForSave(): Promise<void>;
}
export {};
