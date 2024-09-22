var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a;
import cache from "./jupiter-token-list-cache";
import { ApiThrottleCache } from "./util";
const JUPITER_TOKEN_LIST_API = "https://tokens.jup.ag";
const MAX_CONCURRENT_REQUESTS = 10;
const DELAY_MS = 30 * 1000;
const JUPITER_TOKEN_LIST_CACHE = cache;
export const TOKEN_MAP = new Map(JUPITER_TOKEN_LIST_CACHE.tokens.map((array) => {
    const [address, name, symbol, decimals, logoURI] = array;
    return [array[0], { address, name, symbol, decimals, logoURI }];
}));
export function getFullJupiterTokenList() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(JUPITER_TOKEN_LIST_API + "/tokens_with_markets");
        const responseText = yield response.text();
        const data = JSON.parse(responseText);
        return data.map((token) => {
            const { address, name, symbol, decimals, logoURI } = token;
            return { address, name, symbol, decimals, logoURI };
        });
    });
}
export class JupiterTokenListApi {
    static getToken(address) {
        return _a._api.processItem(address, this._getToken);
    }
    static _getToken(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(JUPITER_TOKEN_LIST_API + `/token/${address}`);
            if (response.status == 429) {
                throw new Error(`Too many requests made to Jupiter API`);
            }
            const token = JSON.parse(yield response.text());
            if (token == null) {
                return null;
            }
            const { name, symbol, decimals, logoURI } = token;
            return { address: token.address, name, symbol, decimals, logoURI };
        });
    }
}
_a = JupiterTokenListApi;
JupiterTokenListApi._api = new ApiThrottleCache(MAX_CONCURRENT_REQUESTS, DELAY_MS, TOKEN_MAP, _a._getToken);
//# sourceMappingURL=jupiter-token-list-api.js.map