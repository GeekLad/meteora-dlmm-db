import cache from "./jupiter-token-list-cache";
import { ApiThrottleCache } from "./util";

const JUPITER_LEGACY_TOKEN_LIST_API = "https://tokens.jup.ag";
const JUPITER_V2_TOKEN_API = "https://lite-api.jup.ag/tokens/v2";
const MAX_CONCURRENT_REQUESTS = 1;
const DELAY_MS = 1.1 * 1000;
const JUPITER_TOKEN_LIST_CACHE = cache as {
  lastUpdated: string;
  ignore: string[];
  tokens: TokenMetaArray[];
};
export const TOKEN_MAP: Map<string, TokenMeta> = new Map(
  JUPITER_TOKEN_LIST_CACHE.tokens.map((array) => {
    const [address, name, symbol, decimals, logoURI] = array;
    return [array[0], { address, name, symbol, decimals, logoURI }];
  }),
);

interface JupiterTokenListToken {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  decimals: number;
  circSupply: number;
  totalSupply: number;
  tokenProgram: string;
  firstPool: {
    id: string;
    createdAt: string;
  };
  holderCount: number;
  audit: {
    mintAuthorityDisabled: boolean;
    freezeAuthorityDisabled: boolean;
    topHoldersPercentage: number;
  };
  organicScore: number;
  organicScoreLabel: string;
  isVerified: boolean;
  cexes: string[];
  tags: string[];
  fdv: number;
  mcap: number;
  usdPrice: number;
  priceBlockId: number;
  liquidity: number;
  stats5m: JupiterTokenStats;
  stats1h: JupiterTokenStats;
  stats6h: JupiterTokenStats;
  stats24h: JupiterTokenStats;
  ctLikes: number;
  smartCtLikes: number;
  updatedAt: string;
}

interface JupiterTokenStats {
  priceChange: number;
  liquidityChange: number;
  volumeChange: number;
  buyVolume: number;
  sellVolume: number;
  buyOrganicVolume: number;
  sellOrganicVolume: number;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numOrganicBuyers: number;
  numNetBuyers: number;
}

interface JupiterLegacyTokenListToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags: string[];
  daily_volume: number;
}

export type TokenMetaArray = [
  address: string,
  name: string,
  symbol: string,
  decimals: number,
  logoURI: string,
];

export interface TokenMeta {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

export async function getFullJupiterTokenList(): Promise<TokenMeta[]> {
  const response = await fetch(
    JUPITER_LEGACY_TOKEN_LIST_API + "/tokens_with_markets",
  );
  const responseText = await response.text();

  const data = JSON.parse(responseText) as JupiterLegacyTokenListToken[];

  return data.map((token) => {
    const { address, name, symbol, decimals, logoURI } = token;
    return { address, name, symbol, decimals, logoURI };
  });
}

export class JupiterTokenListApi {
  private static _api = new ApiThrottleCache(
    MAX_CONCURRENT_REQUESTS,
    DELAY_MS,
    TOKEN_MAP,
    this._getToken,
  );

  static updateThrottleParameters(params: { max: number; interval: number }) {
    JupiterTokenListApi._api.max = params.max;
    JupiterTokenListApi._api.interval = params.interval;
  }

  static getToken(address: string): Promise<TokenMeta | null> {
    return JupiterTokenListApi._api.processItem(address, this._getToken);
  }

  private static async _getToken(address: string): Promise<TokenMeta | null> {
    const response = await fetch(
      JUPITER_V2_TOKEN_API + `/search?query=${address}`,
    );
    if (response.status == 429) {
      throw new Error(`Too many requests made to Jupiter API`);
    }
    const parsedResponse = JSON.parse(
      await response.text(),
    ) as JupiterTokenListToken[];
    if (parsedResponse.length === 0) {
      return null;
    }
    const token = parsedResponse[0];
    if (token == null || !token.id) {
      return null;
    }
    const { id, name, symbol, decimals, icon: logoURI } = token;
    return { address: token.id, name, symbol, decimals, logoURI };
  }
}
