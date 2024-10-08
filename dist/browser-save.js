var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import MeteoraDlmmDb from "./meteora-dlmm-db";
import { delay } from "./util";
let Dexie;
let db;
let table;
let saving = false;
let newData;
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!Dexie) {
            const dexie = yield import("dexie");
            Dexie = dexie.Dexie;
        }
        if (!db) {
            db = new Dexie("meteora-dlmm-db");
            db.version(1).stores({
                db: "id",
            });
            table = db.table("db");
        }
    });
}
// Write function
export function writeData(data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (saving) {
            newData = data;
            return;
        }
        saving = true;
        newData = data;
        yield init();
        yield table.put({ id: 1, newData });
        saving = false;
    });
}
// Read function
export function readData() {
    return __awaiter(this, void 0, void 0, function* () {
        while (saving) {
            yield delay(50);
        }
        yield init();
        const record = yield table.get(1);
        return MeteoraDlmmDb.create(record === null || record === void 0 ? void 0 : record.data);
    });
}
//# sourceMappingURL=browser-save.js.map