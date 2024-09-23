import MeteoraDlmmDb from "./meteora-dlmm-db";

let fs: any;
async function init() {
  if (!fs) {
    fs = await import("fs");
  }
}

// Write function
export async function writeData(data: Uint8Array): Promise<void> {
  await init();

  fs.writeFileSync("./meteora-dlmm.db", data);
}

// Read function
export async function readData(): Promise<MeteoraDlmmDb> {
  await init();
  try {
    const data = fs.readFileSync("./meteora-dlmm.db");
    return MeteoraDlmmDb.create(data);
  } catch (err) {
    return MeteoraDlmmDb.create();
  }
}
