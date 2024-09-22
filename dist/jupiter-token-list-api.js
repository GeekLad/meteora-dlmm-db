var _a;
import * as cache from "./jupiter-token-list-cache.json";
import { ApiThrottleCache } from "./util";
const JUPITER_TOKEN_LIST_API = "https://tokens.jup.ag";
const MAX_CONCURRENT_REQUESTS = 10;
const DELAY_MS = 30 * 1000;
const JUPITER_TOKEN_LIST_CACHE = cache;
export const TOKEN_MAP = new Map(JUPITER_TOKEN_LIST_CACHE.tokens.map((array) => {
    const [address, name, symbol, decimals, logoURI] = array;
    return [array[0], { address, name, symbol, decimals, logoURI }];
}));
export async function getFullJupiterTokenList() {
    const response = await fetch(JUPITER_TOKEN_LIST_API + "/tokens_with_markets");
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    return data.map((token) => {
        const { address, name, symbol, decimals, logoURI } = token;
        return { address, name, symbol, decimals, logoURI };
    });
}
export class JupiterTokenListApi {
    static getToken(address) {
        return _a._api.processItem(address, this._getToken);
    }
    static async _getToken(address) {
        const response = await fetch(JUPITER_TOKEN_LIST_API + `/token/${address}`);
        if (response.status == 429) {
            throw new Error(`Too many requests made to Jupiter API`);
        }
        const token = JSON.parse(await response.text());
        if (token == null) {
            return null;
        }
        const { name, symbol, decimals, logoURI } = token;
        return { address: token.address, name, symbol, decimals, logoURI };
    }
}
_a = JupiterTokenListApi;
JupiterTokenListApi._api = new ApiThrottleCache(MAX_CONCURRENT_REQUESTS, DELAY_MS, TOKEN_MAP, _a._getToken);
