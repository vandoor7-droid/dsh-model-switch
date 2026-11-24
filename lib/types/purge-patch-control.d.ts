/** Read the purge tuning, or `{}` when absent. */
export declare function readTuning(): Record<string, unknown>;
/**
 * Whether the official auto-review file currently carries the purge neuter line.
 * `undefined` when the file cannot be resolved or read.
 */
export declare function isNeutered(): boolean | undefined;
/**
 * Enable (restore) the official auto-review by removing the neuter line
 * and writing `permissionPatches: false` to the purge tuning.
 * Returns a human-readable result for the settings card.
 */
export declare function enableOfficialReview(): {
    ok: boolean;
    message: string;
};
/**
 * Disable the official auto-review by re-inserting the neuter line
 * and restoring `permissionPatches: true` in the purge tuning.
 */
export declare function disableOfficialReview(): {
    ok: boolean;
    message: string;
};
