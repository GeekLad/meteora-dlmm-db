import type { ParsedTransactionWithMeta } from "@solana/web3.js";
export type MeteoraDlmmInstructionType = "open" | "add" | "remove" | "claim" | "close";
export type MeteoraDlmmInstructionName = "add_liquidity" | "add_liquidity2" | "add_liquidity_by_strategy" | "add_liquidity_by_strategy2" | "add_liquidity_by_strategy_one_side" | "add_liquidity_by_weight" | "add_liquidity_one_side" | "add_liquidity_one_side_precise" | "add_liquidity_one_side_precise2" | "claim_fee" | "claim_fee2" | "claim_reward" | "claim_reward2" | "close_claim_protocol_fee_operator" | "close_position" | "close_position2" | "close_position_if_empty" | "close_preset_parameter" | "close_preset_parameter2" | "create_claim_protocol_fee_operator" | "decrease_position_length" | "for_idl_type_generation_do_not_call" | "fund_reward" | "go_to_a_bin" | "increase_oracle_length" | "increase_position_length" | "initialize_bin_array" | "initialize_bin_array_bitmap_extension" | "initialize_customizable_permissionless_lb_pair" | "initialize_customizable_permissionless_lb_pair2" | "initialize_lb_pair" | "initialize_lb_pair2" | "initialize_permission_lb_pair" | "initialize_position" | "initialize_position_by_operator" | "initialize_position_pda" | "initialize_preset_parameter" | "initialize_preset_parameter2" | "initialize_reward" | "initialize_token_badge" | "migrate_bin_array" | "migrate_position" | "rebalance_liquidity" | "remove_all_liquidity" | "remove_liquidity" | "remove_liquidity2" | "remove_liquidity_by_range" | "remove_liquidity_by_range2" | "set_activation_point" | "set_pair_status" | "set_pair_status_permissionless" | "set_pre_activation_duration" | "set_pre_activation_swap_address" | "swap" | "swap2" | "swap_exact_out" | "swap_exact_out2" | "swap_with_price_impact" | "swap_with_price_impact2" | "update_base_fee_parameters" | "update_dynamic_fee_parameters" | "update_fees_and_reward2" | "update_fees_and_rewards" | "update_position_operator" | "update_reward_duration" | "update_reward_funder" | "withdraw_ineligible_reward" | "withdraw_protocol_fee";
interface MeteoraDlmmAccounts {
    position: string;
    lbPair: string;
    sender: string;
    tokenXMint?: string | undefined;
    tokenYMint?: string | undefined;
    userTokenX?: string | undefined;
    userTokenY?: string | undefined;
}
export interface TokenTransferInfo {
    mint: string;
    amount: number;
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
