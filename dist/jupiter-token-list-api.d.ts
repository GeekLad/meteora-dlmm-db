export declare const TOKEN_MAP: Map<string, TokenMeta>;
export type TokenMetaArray = [
    address: string,
    name: string,
    symbol: string,
    decimals: number,
    logoURI: string
];
export interface TokenMeta {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
}
export declare function getFullJupiterTokenList(): Promise<TokenMeta[]>;
export declare class JupiterTokenListApi {
    private static _api;
    static getToken(address: string): Promise<TokenMeta | null>;
    private static _getToken;
}
