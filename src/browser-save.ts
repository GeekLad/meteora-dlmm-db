import MeteoraDlmmDb from "./meteora-dlmm-db";

let Dexie: any;
let db: any;
let table: any;

async function init() {
  if (!Dexie) {
    Dexie = await import("dexie");
  }
  if (!db) {
    db = new Dexie("meteora-dlmm-db");
    db.version(1).stores({
      db: "id",
    });
    table = db.table("db");
  }
}

// Write function
export async function writeData(data: Uint8Array): Promise<void> {
  await init();

  await table.put({ id: 1, data });
}

// Read function
export async function readData(): Promise<MeteoraDlmmDb> {
  await init();
  const record = await table.get(1);

  return MeteoraDlmmDb.create(record?.data);
}
