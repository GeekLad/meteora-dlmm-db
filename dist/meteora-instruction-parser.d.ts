import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { type TokenTransferInfo } from "./solana-transaction-utils";
export type MeteoraDlmmInstructionType = "open" | "add" | "remove" | "claim" | "close";
export type MeteoraDlmmInstructionName = "initializePosition" | "addLiquidity" | "addLiquidityByWeight" | "addLiquidityByStrategy" | "addLiquidityByStrategyOneSide" | "addLiquidityOneSide" | "removeLiquidity" | "removeAllLiquidity" | "removeLiquiditySingleSide" | "removeLiquidityByRange" | "RemoveLiquidity" | "claimFee" | "closePosition";
interface MeteoraDlmmAccounts {
    position: string;
    lbPair: string;
    sender: string;
}
export interface MeteoraDlmmInstruction {
    isHawksight: boolean;
    signature: string;
    slot: number;
    blockTime: number;
    instructionName: string;
    instructionType: MeteoraDlmmInstructionType;
    accounts: MeteoraDlmmAccounts;
    tokenTransfers: TokenTransferInfo[];
    activeBinId: number | null;
    removalBps: number | null;
}
export declare function sortMeteoraInstructions(instructions: MeteoraDlmmInstruction[]): MeteoraDlmmInstruction[];
export declare function parseMeteoraInstructions(transaction: ParsedTransactionWithMeta | null): MeteoraDlmmInstruction[];
export {};
