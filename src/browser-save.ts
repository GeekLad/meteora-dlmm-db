import MeteoraDlmmDb from "./meteora-dlmm-db";
import { delay } from "./util";

let Dexie: any;
let db: any;
let table: any;
let saving = false;
let newData: Uint8Array;

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
  if (saving) {
    newData = data;
    return;
  }
  saving = true;
  newData = data;
  await init();

  await table.put({ id: 1, data: newData });
  saving = false;
}

// Read function
export async function readData(): Promise<MeteoraDlmmDb> {
  while (saving) {
    await delay(50);
  }
  await init();
  const record = await table.get(1);

  return MeteoraDlmmDb.create(record?.data);
}
