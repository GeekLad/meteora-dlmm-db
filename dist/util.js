export async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    async processItem(input, processingFunction) {
        const cachedResult = this._getCachedResult(processingFunction, input);
        if (cachedResult) {
            return cachedResult;
        }
        const key = this._getKey(processingFunction, input);
        const activeRequests = this._getActiveRequests(processingFunction);
        if (activeRequests.has(key)) {
            return activeRequests.get(key);
        }
        const promise = new Promise(async (resolve) => {
            await this._throttle();
            const output = await processingFunction(input);
            this._addCachedResult(processingFunction, input, output);
            resolve(output);
            activeRequests.delete(key);
        });
        activeRequests.set(key, promise);
        return promise;
    }
    async _throttle() {
        while (this._requestWindow.length >= this._max) {
            // Calculate wait time based on the oldest request in the window
            const oldestTime = this._requestWindow[0];
            const timeToWait = this._interval - (Date.now() - oldestTime);
            if (timeToWait > 0) {
                // Wait for the calculated time
                await delay(timeToWait);
            }
            else {
                // Remove the oldest request time if it's outside the interval
                this._requestTimes.shift();
            }
        }
        // Add the current timestamp after ensuring space in the window
        this._requestTimes.push(Date.now());
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
    async processItem(input, processingFunction) {
        const key = this._getKey(processingFunction, input);
        const activeRequests = this._getActiveRequests(processingFunction);
        if (activeRequests.has(key)) {
            return activeRequests.get(key);
        }
        const promise = new Promise(async (resolve) => {
            await this._throttle();
            const output = await processingFunction(input);
            resolve(output);
            activeRequests.delete(key);
        });
        activeRequests.set(key, promise);
        return promise;
    }
    async _throttle() {
        while (this._requestWindow.length >= this._max) {
            // Calculate wait time based on the oldest request in the window
            const oldestTime = this._requestWindow[0];
            const timeToWait = this._interval - (Date.now() - oldestTime);
            if (timeToWait > 0) {
                // Wait for the calculated time
                await delay(timeToWait);
            }
            else {
                // Remove the oldest request time if it's outside the interval
                this._requestTimes.shift();
            }
        }
        // Add the current timestamp after ensuring space in the window
        this._requestTimes.push(Date.now());
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
