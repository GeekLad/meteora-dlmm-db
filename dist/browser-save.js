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
let Dexie;
let db;
let table;
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
        yield init();
        yield Promise.all([table.put({ id: 1, data }), table.put({ id: 2, data })]);
    });
}
// Read function
export function readData() {
    return __awaiter(this, void 0, void 0, function* () {
        yield init();
        const record = yield table.get(1);
        return MeteoraDlmmDb.create(record === null || record === void 0 ? void 0 : record.data);
    });
}
//# sourceMappingURL=browser-save.js.map