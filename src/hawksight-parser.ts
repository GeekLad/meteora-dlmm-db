import { LBCLMM_PROGRAM_IDS } from "@meteora-ag/dlmm";
import {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";

export const HAWKSIGHT_PROGRAM_ID =
  "FqGg2Y1FNxMiGd51Q6UETixQWkF5fB92MysbYogRJb3P";

export function getHawksightAccount(
  transaction: ParsedTransactionWithMeta | null,
): string | null {
  if (transaction == null) {
    return null;
  }

  const hawksightInstruction =
    transaction.transaction.message.instructions.find(
      (instruction) =>
        instruction.programId.toBase58() ==
          "FqGg2Y1FNxMiGd51Q6UETixQWkF5fB92MysbYogRJb3P" &&
        "accounts" in instruction &&
        (instruction.accounts.length == 10 ||
          instruction.accounts.length == 15 ||
          instruction.accounts.length == 21 ||
          instruction.accounts.length == 23 ||
          instruction.accounts.length == 7),
    ) as PartiallyDecodedInstruction;

  if (hawksightInstruction) {
    switch (hawksightInstruction.accounts.length) {
      case 10:
      case 15:
      case 21:
      case 23:
        return hawksightInstruction.accounts[2].toBase58();
      case 7:
        return hawksightInstruction.accounts[1].toBase58();
    }
  }

  return null;
}

export function getHawksightTokenTransfers(
  transaction: ParsedTransactionWithMeta,
  meteoraInstruction: PartiallyDecodedInstruction,
  index: number,
): (ParsedInstruction | PartiallyDecodedInstruction)[] {
  if (index == -1) {
    return [];
  }

  const hawksightInstruction = transaction.meta?.innerInstructions?.find(
    (i) => i.index == index,
  );

  if (hawksightInstruction == undefined) {
    return [];
  }

  const meteoraInstructionIndex =
    hawksightInstruction.instructions.indexOf(meteoraInstruction);
  const nextMeteoraInstructionIndex = hawksightInstruction.instructions
    .filter(
      (i, index) =>
        i.programId.toBase58() == LBCLMM_PROGRAM_IDS["mainnet-beta"] &&
        index > meteoraInstructionIndex + 1,
    )
    .map((i) => hawksightInstruction.instructions.indexOf(i))[0];

  return hawksightInstruction.instructions.filter(
    (i, index) =>
      "program" in i &&
      i.program == "spl-token" &&
      "parsed" in i &&
      i.parsed.type == "transferChecked" &&
      index > meteoraInstructionIndex &&
      index < nextMeteoraInstructionIndex,
  );
}
