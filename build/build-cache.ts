import { DLMM_MAP, getAllDlmmPairDetails } from "../src/meteora-dlmm-api";
import {
  getFullJupiterTokenList,
  JupiterTokenListApi,
  TOKEN_MAP,
  TokenMeta,
} from "../src/jupiter-token-list-api";
import tokenCache from "../src/jupiter-token-list-cache.ts";
import { Connection, PublicKey } from "@solana/web3.js";
import { delay } from "../src/util.ts";

const now = new Date();
const connection = new Connection("https://api.mainnet-beta.solana.com");

async function saveTokens(tokens: TokenMeta[]) {
  await Bun.write(
    "./src/jupiter-token-list-cache.ts",
    `
const cache = ${JSON.stringify({
      lastUpdated: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
      tokens: tokens.map((token) => {
        const { address, name, symbol, decimals, logoURI } = token;
        return [address, name, symbol, decimals, logoURI];
      }),
    })};
export default cache;
  `,
  );
}

async function getMissingToken(address: string) {
  await delay(1000);
  const tokenData = await connection.getParsedAccountInfo(
    new PublicKey(address),
  );
  if (
    tokenData.value &&
    tokenData.value.data &&
    "parsed" in tokenData.value.data
  ) {
    return {
      address,
      name: tokenData.value.data.parsed.info.name || null,
      symbol: tokenData.value.data.parsed.info.symbol || null,
      decimals: tokenData.value.data.parsed.info.decimals,
      logoURI: tokenData.value.data.parsed.info.logoURI || null,
    };
  }
  return null;
}

// Update the DLMM cache
console.log("Updating DLMM cache");
const fetchedPairs = await getAllDlmmPairDetails();
const pairs = Array.from(DLMM_MAP.values());
let newPairCount = 0;
fetchedPairs.forEach((pair) => {
  if (!DLMM_MAP.has(pair.lbPair)) {
    pairs.push(pair);
    newPairCount++;
  }
});
await Bun.write(
  "./src/meteora-dlmm-cache.ts",
  `
const cache = ${JSON.stringify({
    lastUpdated: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    pairs: pairs.map((pair) => Object.values(pair)),
  })};
export default cache;
  `,
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
    await saveTokens(tokens);
  }
  if (missingTokenAddresses.length > 0) {
    console.log(
      `Fetching ${missingTokenAddresses.length} individual tokens not found in full list.  Current # of tokens: ${tokens.length}`,
    );
    for (let i = 0; i < missingTokenAddresses.length; i++) {
      const address = missingTokenAddresses[i];
      let missingToken = await JupiterTokenListApi.getToken(address);
      if (missingToken == null || (missingToken && !missingToken.address)) {
        missingToken = await getMissingToken(address);
      }
      if (missingToken != null && missingToken.address) {
        tokens.push(missingToken);
        updatedCount++;
        remaining = missingTokenAddresses.length - updatedCount;
        await saveTokens(tokens);
        if (updatedCount % 10 == 0 && updatedCount > 1) {
          elapsed = Date.now() - start;
          estimated_time =
            Math.round((remaining * elapsed) / updatedCount / 100 / 60) / 10;
          console.log(
            `Fetched ${updatedCount} new tokens out of ${missingTokenAddresses.length}, total of ${tokens.length}, ${remaining} remaining, estimated time to complete: ${estimated_time} minutes`,
          );
        }
      } else {
      }
    }
  } else {
    console.log("No new tokens found");
  }
}
