var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export function delay(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => setTimeout(resolve, ms));
    });
}
export function chunkArray(array, size) {
    if (size <= 0)
        throw new Error("Size must be greater than 0");
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
export class ApiThrottleCache {
    constructor(max, interval, cache, processingFunction) {
        this._cache = new Map();
        this._requestTimes = [];
        this._activeRequests = new Map();
        this._max = max;
        this._interval = interval;
        if (cache && processingFunction) {
            this.addCache(cache, processingFunction);
        }
    }
    addCache(cache, processingFunction) {
        this._cache.set(processingFunction, cache);
    }
    processItem(input, processingFunction) {
        return __awaiter(this, void 0, void 0, function* () {
            const cachedResult = this._getCachedResult(processingFunction, input);
            if (cachedResult) {
                return cachedResult;
            }
            const key = this._getKey(processingFunction, input);
            const activeRequests = this._getActiveRequests(processingFunction);
            if (activeRequests.has(key)) {
                return activeRequests.get(key);
            }
            const promise = new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                yield this._throttle();
                const output = yield processingFunction(input);
                this._addCachedResult(processingFunction, input, output);
                resolve(output);
                activeRequests.delete(key);
            }));
            activeRequests.set(key, promise);
            return promise;
        });
    }
    _throttle() {
        return __awaiter(this, void 0, void 0, function* () {
            while (this._requestWindow.length >= this._max) {
                // Calculate wait time based on the oldest request in the window
                const oldestTime = this._requestWindow[0];
                const timeToWait = this._interval - (Date.now() - oldestTime);
                if (timeToWait > 0) {
                    // Wait for the calculated time
                    yield delay(timeToWait);
                }
                else {
                    // Remove the oldest request time if it's outside the interval
                    this._requestTimes.shift();
                }
            }
            // Add the current timestamp after ensuring space in the window
            this._requestTimes.push(Date.now());
        });
    }
    get _requestWindow() {
        const now = Date.now();
        return this._requestTimes.filter((time) => now - time < this._interval);
    }
    _getCachedResult(processingFunction, input) {
        const key = this._getInputKey(input);
        const cache = this._cache.get(processingFunction);
        if (cache) {
            return cache.get(key);
        }
        this._cache.set(processingFunction, new Map());
        return undefined;
    }
    _addCachedResult(processingFunction, input, output) {
        const key = this._getInputKey(input);
        this._cache.get(processingFunction).set(key, output);
    }
    _getKey(processingFunction, input) {
        return `${processingFunction.name}_${this._getInputKey(input)}`;
    }
    _getInputKey(input) {
        if (this._isPrimitive(input)) {
            return input;
        }
        return JSON.stringify(input);
    }
    _isPrimitive(value) {
        return (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean");
    }
    _getActiveRequests(processingFunction) {
        if (!this._activeRequests.get(processingFunction)) {
            this._activeRequests.set(processingFunction, new Map());
        }
        return this._activeRequests.get(processingFunction);
    }
}
export class ApiThrottle {
    constructor(max, interval) {
        this._requestTimes = [];
        this._activeRequests = new Map();
        this._max = max;
        this._interval = interval;
    }
    processItem(input, processingFunction) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this._getKey(processingFunction, input);
            const activeRequests = this._getActiveRequests(processingFunction);
            if (activeRequests.has(key)) {
                return activeRequests.get(key);
            }
            const promise = new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                yield this._throttle();
                const output = yield processingFunction(input);
                resolve(output);
                activeRequests.delete(key);
            }));
            activeRequests.set(key, promise);
            return promise;
        });
    }
    _throttle() {
        return __awaiter(this, void 0, void 0, function* () {
            while (this._requestWindow.length >= this._max) {
                // Calculate wait time based on the oldest request in the window
                const oldestTime = this._requestWindow[0];
                const timeToWait = this._interval - (Date.now() - oldestTime);
                if (timeToWait > 0) {
                    // Wait for the calculated time
                    yield delay(timeToWait);
                }
                else {
                    // Remove the oldest request time if it's outside the interval
                    this._requestTimes.shift();
                }
            }
            // Add the current timestamp after ensuring space in the window
            this._requestTimes.push(Date.now());
        });
    }
    get _requestWindow() {
        const now = Date.now();
        return this._requestTimes.filter((time) => now - time < this._interval);
    }
    _getKey(processingFunction, input) {
        return `${processingFunction.name}_${this._getInputKey(input)}`;
    }
    _getInputKey(input) {
        if (this._isPrimitive(input)) {
            return input;
        }
        return JSON.stringify(input);
    }
    _isPrimitive(value) {
        return (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean");
    }
    _getActiveRequests(processingFunction) {
        if (!this._activeRequests.get(processingFunction)) {
            this._activeRequests.set(processingFunction, new Map());
        }
        return this._activeRequests.get(processingFunction);
    }
}
