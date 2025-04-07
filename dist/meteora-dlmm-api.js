var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import cache from "./meteora-dlmm-cache";
import { ApiThrottleCache } from "./util";
const METEORA_API = "https://dlmm-api.meteora.ag";
const DLMM_CACHE = cache;
export const DLMM_MAP = new Map(DLMM_CACHE.pairs.map((array) => {
    const [lbPair, name, xSymbol, ySymbol, mintX, mintY, binStep, baseFeeBps] = array;
    return [
        lbPair,
        { lbPair, name, xSymbol, ySymbol, mintX, mintY, binStep, baseFeeBps },
    ];
}));
const MAX_CONCURRENT_REQUESTS = 20;
const DELAY_MS = 3000;
function handleApiResponse(response, parser) {
    return __awaiter(this, void 0, void 0, function* () {
        const responseText = yield response.text();
        const isHtml = responseText.trim().startsWith('<!DOCTYPE html>') || responseText.trim().startsWith('<html>');
        if (isHtml) {
            const isRateLimit = response.status === 429 || responseText.toLowerCase().includes('rate limit');
            const retryAfter = parseInt(response.headers.get('retry-after') || '5');
            return { isHtml, isRateLimit, retryAfter, data: null };
        }
        return {
            isHtml: false,
            isRateLimit: false,
            retryAfter: 0,
            data: parser(responseText)
        };
    });
}
function extractPairData(pair) {
    return __awaiter(this, void 0, void 0, function* () {
        const { address: lbPair, name, mint_x: mintX, mint_y: mintY, bin_step: binStep, base_fee_percentage, } = pair;
        const [xSymbol, ySymbol] = name.split("-");
        const baseFeeBps = Number(base_fee_percentage) * 100;
        return {
            lbPair,
            name,
            xSymbol,
            ySymbol,
            mintX,
            mintY,
            binStep,
            baseFeeBps,
        };
    });
}
export function getAllDlmmPairDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        const pairResponse = yield fetch(METEORA_API + "/pair/all");
        const pairArray = JSON.parse(yield pairResponse.text());
        const pairs = yield Promise.all(pairArray.map((pair) => extractPairData(pair)));
        return pairs;
    });
}
export class MeteoraDlmmApi {
    static updateThrottleParameters(params) {
        MeteoraDlmmApi._meteoraApi.max = params.max;
        MeteoraDlmmApi._meteoraApi.interval = params.interval;
    }
    static getDlmmPairData(lbPair) {
        return MeteoraDlmmApi._meteoraApi.processItem(lbPair, MeteoraDlmmApi._getDlmmPairData);
    }
    static _getDlmmPairData(lbPair) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const pairResponse = yield fetch(METEORA_API + `/pair/${lbPair}`);
                const result = yield handleApiResponse(pairResponse, (text) => JSON.parse(text));
                if (result.isHtml) {
                    if (result.isRateLimit) {
                        console.log(`Rate limited by Meteora API for pair ${lbPair}. Retrying in ${result.retryAfter} seconds...`);
                        yield new Promise(resolve => setTimeout(resolve, result.retryAfter * 1000));
                        return MeteoraDlmmApi._getDlmmPairData(lbPair);
                    }
                    else {
                        console.error(`Received HTML response instead of JSON for pair ${lbPair}`);
                        return null;
                    }
                }
                const pairData = yield extractPairData(result.data);
                return pairData;
            }
            catch (err) {
                console.error(`Failed to fetch Meteora DLMM pair with address ${lbPair}:`, err);
                return null;
            }
        });
    }
    static getTransactions(positionAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const [deposits, withdrawals, fees] = yield Promise.all([
                this._fetchDeposits(positionAddress),
                this._fetchWithdraws(positionAddress),
                this._fetchFees(positionAddress),
            ]);
            return {
                deposits: deposits || [],
                withdrawals: withdrawals || [],
                fees: fees || []
            };
        });
    }
    static _fetchDeposits(positionAddress) {
        return MeteoraDlmmApi._fetchApiData(positionAddress, "/deposits");
    }
    static _fetchWithdraws(positionAddress) {
        return MeteoraDlmmApi._fetchApiData(positionAddress, "/withdraws");
    }
    static _fetchFees(positionAddress) {
        return MeteoraDlmmApi._fetchApiData(positionAddress, "/claim_fees");
    }
    static _fetchApiData(positionAddress, endpoint) {
        return __awaiter(this, void 0, void 0, function* () {
            return MeteoraDlmmApi._meteoraApi.processItem({
                positionAddress,
                endpoint,
            }, () => __awaiter(this, void 0, void 0, function* () {
                try {
                    const url = `${METEORA_API}/position/${positionAddress}${endpoint}`;
                    const response = yield fetch(url);
                    const result = yield handleApiResponse(response, (text) => JSON.parse(text));
                    if (result.isHtml) {
                        if (result.isRateLimit) {
                            console.log(`Rate limited by Meteora API for position ${positionAddress} ${endpoint}. Retrying in ${result.retryAfter} seconds...`);
                            yield new Promise(resolve => setTimeout(resolve, result.retryAfter * 1000));
                            return MeteoraDlmmApi._fetchApiData(positionAddress, endpoint);
                        }
                        else {
                            console.error(`Received HTML response instead of JSON for position ${positionAddress} ${endpoint}`);
                            return null;
                        }
                    }
                    return result.data;
                }
                catch (err) {
                    console.error(`Failed to fetch data for position ${positionAddress} ${endpoint}:`, err);
                    return null;
                }
            }));
        });
    }
}
MeteoraDlmmApi._meteoraApi = new ApiThrottleCache(MAX_CONCURRENT_REQUESTS, DELAY_MS, DLMM_MAP, MeteoraDlmmApi._getDlmmPairData);
//# sourceMappingURL=meteora-dlmm-api.js.map