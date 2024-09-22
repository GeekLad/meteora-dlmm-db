var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const isBrowser = new Function("try {return this===window;}catch(e){ return false;}");
let fs;
let Dexie;
export function dbSave(filename, array) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isBrowser) {
            return nodeSave(filename, array);
        }
        return browserSave(filename, array);
    });
}
function nodeSave(filename, array) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs) {
            fs = yield import("fs");
        }
        fs.writeFileSync(filename, array);
    });
}
function browserSave(filename, array) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!Dexie) {
            const dexie = yield import("dexie");
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
        yield filesTable.put({ filename, data: array });
        console.log(`Data saved with filename: ${filename}`);
    });
}
export function dbLoad(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isBrowser) {
            return nodeLoad(filename);
        }
        return browserLoad(filename);
    });
}
function nodeLoad(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs) {
            fs = yield import("fs");
        }
        return fs.readFileSync(filename);
    });
}
function browserLoad(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!Dexie) {
            const dexie = yield import("dexie");
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
        const record = yield filesTable.get(filename);
        if (record) {
            console.log(`Retrieved data for filename: ${filename}`);
            return record.data;
        }
        else {
            console.log(`No record found for filename: ${filename}`);
            return null;
        }
    });
}
