interface MeteoraApiData {
    tx_id: string;
    onchain_timestamp: number;
    position_address: string;
    pair_address: string;
}
interface MeteoraTransactionData extends MeteoraApiData {
    active_bin_id: number;
    price: number;
    token_x_amount: number;
    token_y_amount: number;
    token_x_usd_amount: number;
    token_y_usd_amount: number;
}
interface MeteoraClaimFeesData extends MeteoraApiData {
    token_x_amount: number;
    token_x_usd_amount: number;
    token_y_amount: number;
    token_y_usd_amount: number;
}
export interface MeteoraPositionTransactions {
    deposits: MeteoraTransactionData[];
    withdrawals: MeteoraTransactionData[];
    fees: MeteoraClaimFeesData[];
}
export interface MeteoraDlmmPairData {
    lbPair: string;
    name: string;
    xSymbol: string;
    ySymbol: string;
    mintX: string;
    mintY: string;
    binStep: number;
    baseFeeBps: number;
}
export declare const DLMM_MAP: Map<string, MeteoraDlmmPairData>;
export declare function getAllDlmmPairDetails(): Promise<MeteoraDlmmPairData[]>;
export declare class MeteoraDlmmApi {
    private static _meteoraApi;
    static updateThrottleParameters(params: {
        max: number;
        interval: number;
    }): void;
    static getDlmmPairData(lbPair: string): Promise<MeteoraDlmmPairData | null>;
    private static _getDlmmPairData;
    static getTransactions(positionAddress: string): Promise<MeteoraPositionTransactions>;
    private static _fetchDeposits;
    private static _fetchWithdraws;
    private static _fetchFees;
    private static _fetchApiData;
}
export {};
