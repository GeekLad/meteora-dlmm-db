export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) throw new Error("Size must be greater than 0");
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}

export class ApiThrottleCache {
  max: number;
  interval: number;
  private _cache: Map<
    ProcessingFunction<any, any>,
    Map<string | number | boolean, any>
  > = new Map();
  private _requestTimes: number[] = [];
  private _activeRequests: Map<
    ProcessingFunction<any, any>,
    Map<string, Promise<any>>
  > = new Map();

  constructor(
    max: number,
    interval: number,
    cache?: Map<string | number | boolean, any>,
    processingFunction?: ProcessingFunction<any, any>,
  ) {
    this.max = max;
    this.interval = interval;
    if (cache && processingFunction) {
      this.addCache(cache, processingFunction);
    }
  }

  addCache<Input, Output>(
    cache: Map<string | number | boolean, Output>,
    processingFunction: ProcessingFunction<Input, Output>,
  ) {
    this._cache.set(processingFunction, cache);
  }

  async processItem<Input, Output>(
    input: Input,
    processingFunction: ProcessingFunction<Input, Output>,
  ): Promise<Output> {
    const cachedResult = this._getCachedResult(processingFunction, input);
    if (cachedResult) {
      return cachedResult;
    }

    const key = this._getKey(processingFunction, input);
    const activeRequests = this._getActiveRequests(processingFunction);

    if (activeRequests.has(key)) {
      return activeRequests.get(key)!;
    }

    const promise = new Promise<Output>(async (resolve) => {
      await this._throttle();
      const output = await processingFunction(input);
      this._addCachedResult(processingFunction, input, output);
      resolve(output);
      activeRequests.delete(key);
    });

    activeRequests.set(key, promise);
    return promise;
  }

  private async _throttle(): Promise<void> {
    while (this._requestWindow.length >= this.max) {
      // Calculate wait time based on the oldest request in the window
      const oldestTime = this._requestWindow[0];
      const timeToWait = this.interval - (Date.now() - oldestTime);

      if (timeToWait > 0) {
        // Wait for the calculated time
        await delay(timeToWait);
      } else {
        // Remove the oldest request time if it's outside the interval
        this._requestTimes.shift();
      }
    }

    // Add the current timestamp after ensuring space in the window
    this._requestTimes.push(Date.now());
  }

  private get _requestWindow() {
    const now = Date.now();

    return this._requestTimes.filter((time) => now - time < this.interval);
  }

  private _getCachedResult<Input, Output>(
    processingFunction: ProcessingFunction<Input, Output>,
    input: Input,
  ): Output | undefined {
    const key = this._getInputKey(input);
    const cache = this._cache.get(processingFunction);
    if (cache) {
      return cache.get(key);
    }
    this._cache.set(processingFunction, new Map());
    return undefined;
  }

  private _addCachedResult<Input, Output>(
    processingFunction: ProcessingFunction<Input, Output>,
    input: Input,
    output: Output,
  ) {
    const key = this._getInputKey(input);
    this._cache.get(processingFunction)!.set(key, output);
  }

  private _getKey<Input>(
    processingFunction: ProcessingFunction<Input, any>,
    input: Input,
  ): string {
    return `${processingFunction.name}_${this._getInputKey(input)}`;
  }

  private _getInputKey<Input>(input: Input): string | number | boolean {
    if (this._isPrimitive(input)) {
      return input as string | number | boolean;
    }
    return JSON.stringify(input);
  }

  private _isPrimitive(value: any): boolean {
    return (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  }

  private _getActiveRequests<Output>(
    processingFunction: ProcessingFunction<any, Output>,
  ) {
    if (!this._activeRequests.get(processingFunction)) {
      this._activeRequests.set(processingFunction, new Map());
    }
    return this._activeRequests.get(processingFunction)!;
  }
}

export class ApiThrottle {
  max: number;
  interval: number;
  private _requestTimes: number[] = [];
  private _activeRequests: Map<
    ProcessingFunction<any, any>,
    Map<string, Promise<any>>
  > = new Map();

  constructor(max: number, interval: number) {
    this.max = max;
    this.interval = interval;
  }

  async processItem<Input, Output>(
    input: Input,
    processingFunction: ProcessingFunction<Input, Output>,
  ): Promise<Output> {
    const key = this._getKey(processingFunction, input);
    const activeRequests = this._getActiveRequests(processingFunction);

    if (activeRequests.has(key)) {
      return activeRequests.get(key)!;
    }

    const promise = new Promise<Output>(async (resolve) => {
      await this._throttle();
      const output = await processingFunction(input);
      resolve(output);
      activeRequests.delete(key);
    });

    activeRequests.set(key, promise);
    return promise;
  }

  private async _throttle(): Promise<void> {
    while (this._requestWindow.length >= this.max) {
      // Calculate wait time based on the oldest request in the window
      const oldestTime = this._requestWindow[0];
      const timeToWait = this.interval - (Date.now() - oldestTime);

      if (timeToWait > 0) {
        // Wait for the calculated time
        await delay(timeToWait);
      } else {
        // Remove the oldest request time if it's outside the interval
        this._requestTimes.shift();
      }
    }

    // Add the current timestamp after ensuring space in the window
    this._requestTimes.push(Date.now());
  }

  private get _requestWindow() {
    const now = Date.now();

    return this._requestTimes.filter((time) => now - time < this.interval);
  }

  private _getKey<Input>(
    processingFunction: ProcessingFunction<Input, any>,
    input: Input,
  ): string {
    return `${processingFunction.name}_${this._getInputKey(input)}`;
  }

  private _getInputKey<Input>(input: Input): string | number | boolean {
    if (this._isPrimitive(input)) {
      return input as string | number | boolean;
    }
    return JSON.stringify(input);
  }

  private _isPrimitive(value: any): boolean {
    return (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  }

  private _getActiveRequests<Output>(
    processingFunction: ProcessingFunction<any, Output>,
  ) {
    if (!this._activeRequests.get(processingFunction)) {
      this._activeRequests.set(processingFunction, new Map());
    }
    return this._activeRequests.get(processingFunction)!;
  }
}

type ProcessingFunction<Input, Output> = (input: Input) => Promise<Output>;
