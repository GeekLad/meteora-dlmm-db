import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { type TokenTransferInfo } from "./solana-transaction-utils";
export type MeteoraDlmmInstructionType = "open" | "add" | "remove" | "claim" | "close";
export type MeteoraDlmmInstructionName = "initializePosition" | "initializePositionPda" | "initializePositionByOperator" | "addLiquidity" | "addLiquidity2" | "addLiquidityByWeight" | "addLiquidityByStrategy" | "addLiquidityByStrategy2" | "addLiquidityByStrategyOneSide" | "addLiquidityOneSidePrecise2" | "addLiquidityOneSide" | "addLiquidityOneSidePrecise" | "removeLiquidity" | "removeLiquidity2" | "removeAllLiquidity" | "removeLiquiditySingleSide" | "removeLiquidityByRange" | "removeLiquidityByRange2" | "RemoveLiquidity" | "claimFee" | "claimFee2" | "closePosition";
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
