import cache from "./meteora-dlmm-cache";
import { ApiThrottleCache } from "./util";

interface MeteoraDlmmPairDetail {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
}

type ApiDataEndpoint =
  | "/deposits"
  | "/withdraws"
  | "/claim_fees"
  | "/claim_rewards";
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

type MeteoraDlmmPairDataArray = [
  lbPair: string,
  name: string,
  xSymbol: string,
  ySymbol: string,
  mintX: string,
  mintY: string,
  binStep: number,
  baseFeeBps: number,
];

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

const METEORA_API = "https://dlmm-api.meteora.ag";
const DLMM_CACHE = cache as {
  lastUpdated: string;
  pairs: MeteoraDlmmPairDataArray[];
};
export const DLMM_MAP: Map<string, MeteoraDlmmPairData> = new Map(
  DLMM_CACHE.pairs.map((array) => {
    const [lbPair, name, xSymbol, ySymbol, mintX, mintY, binStep, baseFeeBps] =
      array;
    return [
      lbPair,
      { lbPair, name, xSymbol, ySymbol, mintX, mintY, binStep, baseFeeBps },
    ];
  }),
);
const MAX_CONCURRENT_REQUESTS = 20;
const DELAY_MS = 3000;

interface ApiResponse<T> {
  isHtml: boolean;
  isRateLimit: boolean;
  retryAfter: number;
  data: T | null;
}

async function handleApiResponse<T>(
  response: Response,
  parser: (text: string) => T,
): Promise<ApiResponse<T>> {
  const responseText = await response.text();
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
}

async function extractPairData(
  pair: MeteoraDlmmPairDetail,
): Promise<MeteoraDlmmPairData> {
  const {
    address: lbPair,
    name,
    mint_x: mintX,
    mint_y: mintY,
    bin_step: binStep,
    base_fee_percentage,
  } = pair;
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
}

export async function getAllDlmmPairDetails(): Promise<MeteoraDlmmPairData[]> {
  const pairResponse = await fetch(METEORA_API + "/pair/all");
  const pairArray = JSON.parse(
    await pairResponse.text(),
  ) as MeteoraDlmmPairDetail[];

  const pairs = await Promise.all(
    pairArray.map((pair) => extractPairData(pair)),
  );
  return pairs;
}

export class MeteoraDlmmApi {
  private static _meteoraApi = new ApiThrottleCache(
    MAX_CONCURRENT_REQUESTS,
    DELAY_MS,
    DLMM_MAP,
    MeteoraDlmmApi._getDlmmPairData,
  );

  static updateThrottleParameters(params: { max: number; interval: number }) {
    MeteoraDlmmApi._meteoraApi.max = params.max;
    MeteoraDlmmApi._meteoraApi.interval = params.interval;
  }

  static getDlmmPairData(lbPair: string): Promise<MeteoraDlmmPairData> {
    return MeteoraDlmmApi._meteoraApi.processItem(
      lbPair,
      MeteoraDlmmApi._getDlmmPairData,
    );
  }

  private static async _getDlmmPairData(
    lbPair: string,
  ): Promise<MeteoraDlmmPairData> {
    try {
      const pairResponse = await fetch(METEORA_API + `/pair/${lbPair}`);
      const result = await handleApiResponse(pairResponse, (text) => 
        JSON.parse(text) as MeteoraDlmmPairDetail
      );

      if (result.isHtml) {
        if (result.isRateLimit) {
          await new Promise(resolve => setTimeout(resolve, result.retryAfter * 1000));
          return MeteoraDlmmApi._getDlmmPairData(lbPair);
        } else {
          // TODO: Handle other HTML error responses more gracefully
          // For now, throw error to be caught by outer catch block
          throw new Error('Received HTML response instead of JSON');
        }
      }

      const pairData = await extractPairData(result.data!);
      return pairData;
    } catch (err) {
      throw new Error(`Meteora DLMM pair with address ${lbPair} was not found`);
    }
  }

  static async getTransactions(
    positionAddress: string,
  ): Promise<MeteoraPositionTransactions> {
    const [deposits, withdrawals, fees] = await Promise.all([
      this._fetchDeposits(positionAddress),
      this._fetchWithdraws(positionAddress),
      this._fetchFees(positionAddress),
    ]);
    return { deposits, withdrawals, fees };
  }

  private static _fetchDeposits(positionAddress: string) {
    return MeteoraDlmmApi._fetchApiData(
      positionAddress,
      "/deposits",
    ) as Promise<MeteoraTransactionData[]>;
  }

  private static _fetchWithdraws(positionAddress: string) {
    return MeteoraDlmmApi._fetchApiData(
      positionAddress,
      "/withdraws",
    ) as Promise<MeteoraTransactionData[]>;
  }

  private static _fetchFees(positionAddress: string) {
    return MeteoraDlmmApi._fetchApiData(
      positionAddress,
      "/claim_fees",
    ) as Promise<MeteoraClaimFeesData[]>;
  }

  private static async _fetchApiData<Output>(
    positionAddress: string,
    endpoint: ApiDataEndpoint,
  ): Promise<Output> {
    return MeteoraDlmmApi._meteoraApi.processItem(
      {
        positionAddress,
        endpoint,
      },
      async () => {
        const url = `${METEORA_API}/position/${positionAddress}${endpoint}`;
        const response = await fetch(url);
        const result = await handleApiResponse(response, (text) => 
          JSON.parse(text) as Output
        );

        if (result.isHtml) {
          if (result.isRateLimit) {
            await new Promise(resolve => setTimeout(resolve, result.retryAfter * 1000));
            return MeteoraDlmmApi._fetchApiData<Output>(positionAddress, endpoint);
          } else {
            // TODO: Handle other HTML error responses more gracefully
            // For now, return empty array as this is used for transaction lists
            return [] as unknown as Output;
          }
        }

        return result.data!;
      },
    );
  }
}
