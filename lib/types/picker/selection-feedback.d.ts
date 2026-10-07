/** Immediate picker feedback around an asynchronous Host model selection. */
export declare function beginSelection<T>(select: () => Promise<T>, showFeedback: () => void, settle: (outcome: T) => void): Promise<void>;
