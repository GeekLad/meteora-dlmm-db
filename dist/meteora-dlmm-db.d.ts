import { type MeteoraDlmmInstruction } from "./meteora-instruction-parser";
import { type MeteoraDlmmPairData, type MeteoraPositionTransactions } from "./meteora-dlmm-api";
import { type TokenMeta } from "./jupiter-token-list-api";
import MeteoraDlmmStream from "./meteora-dlmm-downloader";
interface MeteoraDlmmDbSchema {
    [column: string]: number | boolean | string | Array<unknown> | Uint8Array | null;
}
export interface MeteoraDlmmDbTransactions extends MeteoraDlmmDbSchema {
    block_time: number;
    signature: string;
    position_address: string;
    owner_address: string;
    pair_address: string;
    base_mint: string;
    base_symbol: string;
    base_decimals: number;
    quote_mint: string;
    quote_symbol: string;
    quote_decimals: string;
    is_inverted: number;
    removal_bps: number;
    position_is_open: boolean;
    price: number;
    fee_amount: number;
    deposit: number;
    withdrawal: number;
    impermanent_loss: number;
    pnl: number;
    usd_fee_amount: number;
    usd_deposit: number;
    usd_withdrawal: number;
    usd_impermanent_loss: number;
    usd_pnl: number;
}
export interface MeteoraDlmmDbPairs extends MeteoraDlmmDbSchema {
    pair_address: string;
    name: string;
    mint_x: string;
    mint_y: string;
    bin_step: number;
    base_fee_bps: number;
}
export interface MeteoraDlmmDbTokens extends MeteoraDlmmDbSchema {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logo: string;
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
    private _getTransactions;
    private _downloaders;
    private constructor();
    static create(data?: ArrayLike<number> | Buffer | null): Promise<MeteoraDlmmDb>;
    static load(): Promise<MeteoraDlmmDb>;
    private _init;
    private _createTables;
    private _createStatements;
    private _addInitialData;
    addInstruction(instruction: MeteoraDlmmInstruction): void;
    addTransfers(instruction: MeteoraDlmmInstruction): void;
    addPair(pair: MeteoraDlmmPairData): void;
    addToken(token: TokenMeta): void;
    addUsdTransactions(position_address: string, transactions: MeteoraPositionTransactions): void;
    setOldestSignature($account_address: string, $oldest_block_time: number, $oldest_signature: string): void;
    markComplete($account_address: string): void;
    isComplete(account_address: string): boolean;
    download(endpoint: string, account: string, callbacks?: {
        onDone?: (...args: any[]) => any;
    }): MeteoraDlmmStream;
    getMissingPairs(): string[];
    getMissingTokens(): string[];
    getMissingUsd(): string[];
    getMostRecentSignature(owner_address: string): string | undefined;
    getOldestSignature(owner_address: string): string | undefined;
    getTransactions(): MeteoraDlmmDbTransactions[];
    cancelDownload(account: string): Promise<void>;
    private _getAll;
    save(): Promise<void>;
}
export {};
