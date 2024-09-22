import { DLMM_MAP, getAllDlmmPairDetails } from "../src/meteora-dlmm-api";
import {
  getFullJupiterTokenList,
  JupiterTokenListApi,
  TOKEN_MAP,
  TokenMeta,
} from "../src/jupiter-token-list-api";
import * as tokenCache from "../src/jupiter-token-list-cache.json";

const ingoreTokens: string[] = tokenCache.ignore;
const now = new Date();

async function saveTokens(tokens: TokenMeta[], ignoreTokens: string[]) {
  await Bun.write(
    "./src/jupiter-token-list-cache.json",
    JSON.stringify({
      lastUpdated: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
      ignore: Array.from(new Set(ignoreTokens)),
      tokens: tokens.map((token) => {
        const { address, name, symbol, decimals, logoURI } = token;
        return [address, name, symbol, decimals, logoURI];
      }),
    }),
  );
}

// Update the DLMM cache
console.log("Updating DLMM cache");
const fetchedPairs = await getAllDlmmPairDetails();
const pairs = Array.from(DLMM_MAP.values());
let newPairCount = 0;
fetchedPairs.forEach((pair) => {
  if (
    !DLMM_MAP.has(pair.lbPair) &&
    !ingoreTokens.includes(pair.mintX) &&
    !ingoreTokens.includes(pair.mintY)
  ) {
    pairs.push(pair);
    newPairCount++;
  }
});
await Bun.write(
  "./src/meteora-dlmm-cache.json",
  JSON.stringify({
    lastUpdated: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    pairs: pairs.map((pair) => Object.values(pair)),
  }),
);
if (newPairCount > 0) {
  console.log(`Saved ${newPairCount} new pairs`);
} else {
  console.log("No new pairs found");
}

// Update the Jupiter token list cache
if (newPairCount > 0) {
  console.log("Fetching full Jupiter token list");
  const tokensFromApi = await getFullJupiterTokenList();
  const oldTokenListSize = TOKEN_MAP.size;
  tokensFromApi.forEach((token) => TOKEN_MAP.set(token.address, token));
  const allDlmmTokenAddresses = Array.from(
    new Set(pairs.map((pair) => [pair.mintX, pair.mintY]).flat()),
  );
  const missingTokenAddresses = allDlmmTokenAddresses.filter(
    (address) => !TOKEN_MAP.has(address),
  );
  const tokens = Array.from(TOKEN_MAP.values()).filter(
    (token) => token && allDlmmTokenAddresses.includes(token.address),
  );

  let updatedCount = 0;
  let elapsed = 0;
  let estimated_time = 0;
  let remaining = missingTokenAddresses.length - updatedCount;
  const start = Date.now();
  if (oldTokenListSize < tokens.length) {
    console.log(
      `Saving ${
        tokens.length - oldTokenListSize
      } new tokens fetched from full token list.`,
    );
    await saveTokens(tokens, ingoreTokens);
  }
  if (missingTokenAddresses.length > 0) {
    console.log(
      `Fetching ${missingTokenAddresses.length} individual tokens not found in full list.  Current # of tokens: ${tokens.length}`,
    );
    for (let i = 0; i < missingTokenAddresses.length; i++) {
      const address = missingTokenAddresses[i];
      const missingToken = await JupiterTokenListApi.getToken(address);
      if (missingToken != null) {
        tokens.push(missingToken);
        updatedCount++;
        remaining = missingTokenAddresses.length - updatedCount;
        await saveTokens(tokens, ingoreTokens);
        if (updatedCount % 10 == 0 && updatedCount > 1) {
          elapsed = Date.now() - start;
          estimated_time =
            Math.round((remaining * elapsed) / updatedCount / 100 / 60) / 10;
          console.log(
            `Fetched ${updatedCount} new tokens out of ${missingTokenAddresses.length}, total of ${tokens.length}, ${remaining} remaining, estimated time to complete: ${estimated_time} minutes`,
          );
        }
      } else {
        console.log(`Token ${address} not found`);
        ingoreTokens.push(address);
        await saveTokens(tokens, ingoreTokens);
      }
    }
  } else {
    console.log("No new tokens found");
  }
}
