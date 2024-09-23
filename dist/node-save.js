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
let fs;
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs) {
            fs = yield import("fs");
        }
    });
}
// Write function
export function writeData(data) {
    return __awaiter(this, void 0, void 0, function* () {
        yield init();
        fs.writeFileSync("./meteora-dlmm.db", data);
    });
}
// Read function
export function readData() {
    return __awaiter(this, void 0, void 0, function* () {
        yield init();
        try {
            const data = fs.readFileSync("./meteora-dlmm.db");
            return MeteoraDlmmDb.create(data);
        }
        catch (err) {
            return MeteoraDlmmDb.create();
        }
    });
}
//# sourceMappingURL=node-save.js.map