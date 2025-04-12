import { IDL, LBCLMM_PROGRAM_IDS } from "@meteora-ag/dlmm";
import { BorshEventCoder, BorshInstructionCoder, } from "@project-serum/anchor";
import { base64, bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { getInstructionIndex, getAccountMetas, getTokenTransfers, } from "./solana-transaction-utils";
import { getHawksightAccount, getHawksightTokenTransfers, } from "./hawksight-parser";
const INSTRUCTION_MAP = new Map([
    ["initializePosition", "open"],
    ["initializePositionPda", "open"],
    ["initializePositionByOperator", "open"],
    ["addLiquidity", "add"],
    ["addLiquidity2", "add"],
    ["addLiquidityByWeight", "add"],
    ["addLiquidityByStrategy", "add"],
    ["addLiquidityByStrategy2", "add"],
    ["addLiquidityByStrategyOneSide", "add"],
    ["addLiquidityOneSide", "add"],
    ["addLiquidityOneSidePrecise", "add"],
    ["addLiquidityOneSidePrecise2", "add"],
    ["removeLiquidity", "remove"],
    ["removeLiquidity2", "remove"],
    ["removeAllLiquidity", "remove"],
    ["removeLiquiditySingleSide", "remove"],
    ["removeLiquidityByRange", "remove"],
    ["removeLiquidityByRange2", "remove"],
    ["RemoveLiquidity", "remove"],
    ["claimFee", "claim"],
    ["claimFee2", "claim"],
    ["closePosition", "close"],
    ["closePositionIfEmpty", "close"],
    ["closePosition2", "close"],
]);
const INSTRUCTION_CODER = new BorshInstructionCoder(IDL);
let EVENT_CODER = new BorshEventCoder(IDL);
export function sortMeteoraInstructions(instructions) {
    return instructions.sort((a, b) => {
        return a.blockTime != b.blockTime
            ? // If they're different block times, take them in ascending order
                a.blockTime - b.blockTime
            : // Take the first instruction when it is open
                a.instructionType == "open"
                    ? -1
                    : // Take the second instruction when it is open
                        b.instructionType == "open"
                            ? 1
                            : // Take the first instruction when it is claim
                                a.instructionType == "claim"
                                    ? -1
                                    : // Take the second instruction when it is claim
                                        b.instructionType == "claim"
                                            ? 1
                                            : // Take the second instruction when the first is close
                                                a.instructionType == "close"
                                                    ? 1
                                                    : // Take the first instruction when the second is close
                                                        b.instructionType == "close"
                                                            ? -1
                                                            : // Everthing else just take it as it comes
                                                                0;
    });
}
export function parseMeteoraInstructions(transaction) {
    var _a;
    if (transaction == null) {
        return [];
    }
    const hawksightAccount = getHawksightAccount(transaction);
    const parsedInstructions = transaction.transaction.message.instructions.map((instruction) => parseMeteoraInstruction(transaction, instruction, hawksightAccount));
    if ((_a = transaction.meta) === null || _a === void 0 ? void 0 : _a.innerInstructions) {
        const innerInstructions = transaction.meta.innerInstructions
            .map((instruction) => instruction.instructions)
            .flat()
            .map((instruction) => parseMeteoraInstruction(transaction, instruction, hawksightAccount));
        return parsedInstructions
            .concat(innerInstructions)
            .filter((instruction) => instruction !== null);
    }
    return parsedInstructions.filter((instruction) => instruction !== null);
}
function parseMeteoraInstruction(transaction, instruction, hawksightAccount) {
    if (instruction.programId.toBase58() == LBCLMM_PROGRAM_IDS["mainnet-beta"]) {
        try {
            if ("data" in instruction) {
                return getMeteoraInstructionData(transaction, instruction, hawksightAccount);
            }
        }
        catch (err) {
            console.error(err);
            throw new Error(`Failed to parse Meteora DLMM instruction on signature ${transaction.transaction.signatures[0]}`);
        }
    }
    return null;
}
function getMeteoraInstructionData(transaction, instruction, hawksightAccount) {
    const decodedInstruction = INSTRUCTION_CODER.decode(instruction.data, "base58");
    if (!transaction.blockTime) {
        throw new Error(`Transaction blockTime missing from signature ${transaction.transaction.signatures[0]}`);
    }
    if (!decodedInstruction || !INSTRUCTION_MAP.has(decodedInstruction.name)) {
        // Unknown instruction
        return null;
    }
    const index = getInstructionIndex(transaction, instruction);
    if (index == -1) {
        return null;
    }
    const instructionName = decodedInstruction.name;
    const instructionType = INSTRUCTION_MAP.get(decodedInstruction.name);
    const accountMetas = getAccountMetas(transaction, instruction);
    const accounts = getPositionAccounts(decodedInstruction, accountMetas, hawksightAccount);
    const parsedTokenTransfers = !hawksightAccount
        ? getTokenTransfers(transaction, index)
        : getHawksightTokenTransfers(transaction, instruction, index);
    const tokenTransfers = parseTokenTransfers(parsedTokenTransfers, accounts);
    const activeBinId = parsedTokenTransfers.length > 0 ? getActiveBinId(transaction, index) : null;
    const removalBps = instructionType == "remove" ? getRemovalBps(decodedInstruction) : null;
    return {
        isHawksight: Boolean(hawksightAccount),
        signature: transaction.transaction.signatures[0],
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        instructionName,
        instructionType,
        accounts,
        tokenTransfers,
        activeBinId,
        removalBps,
    };
}
function parseTokenTransfers(transfers, accounts) {
    return transfers
        .map((transfer) => {
        if ("program" in transfer &&
            transfer.program == "spl-token" &&
            "parsed" in transfer) {
            if (transfer.parsed.type == "transferChecked") {
                const { mint, tokenAmount } = transfer.parsed.info;
                const amount = Number(tokenAmount.amount);
                return {
                    mint,
                    amount,
                };
            }
            if (!accounts.tokenXMint ||
                !accounts.tokenYMint ||
                !accounts.userTokenX ||
                !accounts.userTokenY) {
                throw new Error("Mints were not found in instruction, unable to parse token transfers");
            }
            const mint = transfer.parsed.info.source == accounts.tokenXMint ||
                transfer.parsed.info.destination == accounts.userTokenX
                ? accounts.tokenXMint
                : accounts.tokenYMint;
            const amount = Number(transfer.parsed.info.amount);
            return {
                mint,
                amount,
            };
        }
        throw new Error("Unrecognized transfer format");
    })
        .filter((transfer) => transfer !== undefined);
}
function getPositionAccounts(decodedInstruction, accountMetas, hawksightAccount) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const { accounts } = INSTRUCTION_CODER.format(decodedInstruction, accountMetas);
        const positionAccount = accounts.find((account) => account.name == "Position");
        const position = positionAccount.pubkey.toBase58();
        const lbPairAccount = accounts.find((account) => account.name == "Lb Pair");
        const lbPair = lbPairAccount.pubkey.toBase58();
        const senderAccount = accounts.find((account) => account.name == "Sender" || account.name == "Owner");
        const sender = hawksightAccount || senderAccount.pubkey.toBase58();
        const tokenXMint = (_b = (_a = accounts
            .find((account) => account.name == "Token X Mint")) === null || _a === void 0 ? void 0 : _a.pubkey) === null || _b === void 0 ? void 0 : _b.toBase58();
        const tokenYMint = (_d = (_c = accounts
            .find((account) => account.name == "Token Y Mint")) === null || _c === void 0 ? void 0 : _c.pubkey) === null || _d === void 0 ? void 0 : _d.toBase58();
        const userTokenX = (_f = (_e = accounts
            .find((account) => account.name == "User Token X")) === null || _e === void 0 ? void 0 : _e.pubkey) === null || _f === void 0 ? void 0 : _f.toBase58();
        const userTokenY = (_h = (_g = accounts
            .find((account) => account.name == "User Token Y")) === null || _g === void 0 ? void 0 : _g.pubkey) === null || _h === void 0 ? void 0 : _h.toBase58();
        return {
            position,
            lbPair,
            sender,
            tokenXMint,
            tokenYMint,
            userTokenX,
            userTokenY,
        };
    }
    catch (err) {
        switch (decodedInstruction.name) {
            case "initializePosition":
                return {
                    position: accountMetas[1].pubkey.toBase58(),
                    lbPair: accountMetas[2].pubkey.toBase58(),
                    sender: hawksightAccount || accountMetas[3].pubkey.toBase58(),
                };
            case "addLiquidityOneSide":
            case "addLiquidityOneSidePrecise":
                return {
                    position: accountMetas[0].pubkey.toBase58(),
                    lbPair: accountMetas[1].pubkey.toBase58(),
                    sender: hawksightAccount || accountMetas[8].pubkey.toBase58(),
                };
            case "addLiquidityByWeight":
                return {
                    position: accountMetas[0].pubkey.toBase58(),
                    lbPair: accountMetas[1].pubkey.toBase58(),
                    sender: hawksightAccount || accountMetas[11].pubkey.toBase58(),
                };
            case "addLiquidity2":
            case "addLiquidityByStrategy2":
            case "removeLiquidity2":
            case "removeLiquidityByRange2":
                return {
                    position: accountMetas[0].pubkey.toBase58(),
                    lbPair: accountMetas[1].pubkey.toBase58(),
                    sender: hawksightAccount || accountMetas[9].pubkey.toBase58(),
                };
            case "addLiquidityOneSidePrecise2":
                return {
                    position: accountMetas[0].pubkey.toBase58(),
                    lbPair: accountMetas[1].pubkey.toBase58(),
                    sender: hawksightAccount || accountMetas[6].pubkey.toBase58(),
                };
            case "claimFee2":
                return {
                    position: accountMetas[1].pubkey.toBase58(),
                    lbPair: accountMetas[0].pubkey.toBase58(),
                    sender: hawksightAccount || accountMetas[2].pubkey.toBase58(),
                };
            case "closePosition2":
            case "closePositionIfEmpty":
                return {
                    position: accountMetas[0].pubkey.toBase58(),
                    lbPair: "",
                    sender: hawksightAccount || accountMetas[1].pubkey.toBase58(),
                };
        }
        return {
            position: accountMetas[0].pubkey.toBase58(),
            lbPair: accountMetas[1].pubkey.toBase58(),
            sender: hawksightAccount || accountMetas[11].pubkey.toBase58(),
        };
    }
}
function getActiveBinId(transaction, index) {
    if (transaction.meta && transaction.meta.innerInstructions) {
        const parsedInnerInstruction = transaction.meta.innerInstructions.find((i) => i.index == index);
        if (parsedInnerInstruction && parsedInnerInstruction.instructions) {
            const instructions = parsedInnerInstruction.instructions;
            const meteoraInstructions = instructions.filter((instruction) => instruction.programId.toBase58() ==
                LBCLMM_PROGRAM_IDS["mainnet-beta"]);
            const events = meteoraInstructions.map((instruction) => {
                const ixData = bs58.decode(instruction.data);
                // @ts-ignore
                const eventData = base64.encode(ixData.subarray(8));
                return EVENT_CODER.decode(eventData);
            });
            const eventWithActiveBinId = events.find((event) => event && "activeBinId" in event.data);
            return eventWithActiveBinId
                ? eventWithActiveBinId.data.activeBinId
                : null;
        }
    }
    return null;
}
function getRemovalBps(decodedInstruction) {
    if ("bpsToRemove" in decodedInstruction.data) {
        return Number(decodedInstruction.data.bpsToRemove);
    }
    if ("binLiquidityRemoval" in decodedInstruction.data) {
        return Number(decodedInstruction.data.binLiquidityRemoval[0].bpsToRemove);
    }
    if (decodedInstruction.name.match(/remove/i)) {
        return 10000;
    }
    return null;
}
//# sourceMappingURL=meteora-instruction-parser.js.map