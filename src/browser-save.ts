import MeteoraDlmmDb from "./meteora-dlmm-db";

let Dexie: any;
let db: any;
let table: any;

async function init() {
  if (!Dexie) {
    const dexie = await import("dexie");
    Dexie = dexie.Dexie;
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

  await Promise.all([table.put({ id: 1, data }), table.put({ id: 2, data })]);
}

// Read function
export async function readData(): Promise<MeteoraDlmmDb> {
  await init();
  const record = await table.get(1);

  return MeteoraDlmmDb.create(record?.data);
}
