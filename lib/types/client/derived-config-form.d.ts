import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
/** One field-level change expressed against a view model, before source-path mapping. */
export interface ConfigViewOp<T> {
    field: keyof T & string;
    value?: unknown;
}
export interface ConfigViewForm<T> {
    getSnapshot(): ConfigFormSnapshot<T>;
    subscribe(listener: () => void): () => void;
    set(field: keyof T & string, value: unknown): Promise<void>;
    unset(field: keyof T & string): Promise<void>;
    /**
     * Apply several view-field changes as ONE revision-fenced source write, so a row save
     * either lands completely or is rejected as a whole instead of leaving a half-written pair.
     *
     * @param ops view fields to change; `value === undefined` unsets the source field
     * @param expectedRevision revision the draft was seeded from; forwarded to the source fence
     * @returns a promise that rejects with `settings-rejected` when the host refuses the write
     */
    mutate(ops: readonly ConfigViewOp<T>[], expectedRevision?: number): Promise<void>;
}
export declare function deriveConfigForm<Source, View>(source: ConfigForm<Source>, project: (value: Source) => View, fields: {
    [K in keyof View & string]: keyof Source & string;
}): ConfigViewForm<View>;
