import { ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import { TokenTransferInfo } from "./solana-transaction-utils";
export declare const HAWKSIGHT_PROGRAM_ID = "FqGg2Y1FNxMiGd51Q6UETixQWkF5fB92MysbYogRJb3P";
export declare function getHawksightAccount(transaction: ParsedTransactionWithMeta | null): string | null;
export declare function getHawksightTokenTransfers(transaction: ParsedTransactionWithMeta, meteoraInstruction: PartiallyDecodedInstruction, index: number): TokenTransferInfo[];
