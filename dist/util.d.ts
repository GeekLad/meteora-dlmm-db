export declare function delay(ms: number): Promise<unknown>;
export declare function chunkArray<T>(array: T[], size: number): T[][];
export declare class ApiThrottleCache {
    max: number;
    interval: number;
    private _cache;
    private _requestTimes;
    private _activeRequests;
    constructor(max: number, interval: number, cache?: Map<string | number | boolean, any>, processingFunction?: ProcessingFunction<any, any>);
    addCache<Input, Output>(cache: Map<string | number | boolean, Output>, processingFunction: ProcessingFunction<Input, Output>): void;
    processItem<Input, Output>(input: Input, processingFunction: ProcessingFunction<Input, Output>): Promise<Output>;
    private _throttle;
    private get _requestWindow();
    private _getCachedResult;
    private _addCachedResult;
    private _getKey;
    private _getInputKey;
    private _isPrimitive;
    private _getActiveRequests;
}
export declare class ApiThrottle {
    max: number;
    interval: number;
    private _requestTimes;
    private _activeRequests;
    constructor(max: number, interval: number);
    processItem<Input, Output>(input: Input, processingFunction: ProcessingFunction<Input, Output>): Promise<Output>;
    private _throttle;
    private get _requestWindow();
    private _getKey;
    private _getInputKey;
    private _isPrimitive;
    private _getActiveRequests;
}
type ProcessingFunction<Input, Output> = (input: Input) => Promise<Output>;
export {};
