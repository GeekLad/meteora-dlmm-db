const isBrowser = new Function(
  "try {return this===window;}catch(e){ return false;}",
);

let fs: any;
let Dexie: any;
export async function dbSave(filename: string, array: Uint8Array) {
  if (!isBrowser) {
    return nodeSave(filename, array);
  }
  return browserSave(filename, array);
}

async function nodeSave(filename: string, array: Uint8Array) {
  if (!fs) {
    fs = await import("fs");
  }
  fs.writeFileSync(filename, array);
}

async function browserSave(filename: string, array: Uint8Array) {
  if (!Dexie) {
    const dexie = await import("dexie");
    Dexie = dexie.Dexie;
  }

  // Initialize Dexie within the function
  const db = new Dexie("MeteoraDLMMDB");
  db.version(1).stores({
    files: "filename", // Using filename as the primary key
  });

  // Access the table
  const filesTable = db.table("files");

  // Save the data
  await filesTable.put({ filename, data: array });
  console.log(`Data saved with filename: ${filename}`);
}

export async function dbLoad(filename: string) {
  if (!isBrowser) {
    return nodeLoad(filename);
  }
  return browserLoad(filename);
}

async function nodeLoad(filename: string): Promise<Buffer> {
  if (!fs) {
    fs = await import("fs");
  }
  return fs.readFileSync(filename);
}

async function browserLoad(filename: string): Promise<Uint8Array | null> {
  if (!Dexie) {
    const dexie = await import("dexie");
    Dexie = dexie.Dexie;
  }

  // Initialize Dexie within the function
  const db = new Dexie("MeteoraDLMMDB");
  db.version(1).stores({
    files: "filename", // Using filename as the primary key
  });

  // Access the table
  const filesTable = db.table("files");

  // Retrieve the data
  const record = await filesTable.get(filename);
  if (record) {
    console.log(`Retrieved data for filename: ${filename}`);
    return record.data;
  } else {
    console.log(`No record found for filename: ${filename}`);
    return null;
  }
}
