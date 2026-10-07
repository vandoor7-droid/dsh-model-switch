/**
 * Compensate the Host's own deployment-default write after a Session-only
 * model switch.
 *
 * `session.selectModel` installs the Session selection and, on Hosts that
 * persist a selection as the deployment default, also writes that default.
 * The plugin switches a Session only, so the captured Main default is restored
 * afterwards.
 *
 * That Host write is fenced by a settings revision, and its timing is not part
 * of the released contract: the 0.1.x generation awaited the default write
 * before its RPC resolved, while the 0.2.x generation fires it without
 * awaiting. A fixed `captured + 1` fence therefore either refuses the restore
 * or silently leaves the default switched. Poll-by-revision is used instead:
 * wait for the observed revision to leave the captured one, then fence on the
 * revision actually observed.
 */
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { MainSettingsView } from '../../client-contract.ts';
/** The Main Settings namespace surface this module needs. */
export interface MainDefaultForm {
    getSnapshot(): ConfigFormSnapshot<MainSettingsView>;
    subscribe(listener: () => void): () => void;
    mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<boolean>;
}
/** Outcome of one compensation attempt. */
export interface MainDefaultRestore {
    /** The captured Main default is the effective one again (or no write occurred). */
    restored: boolean;
    /** A newer revision won instead; the concurrent edit is left untouched. */
    conflict: boolean;
}
export interface MainDefaultRestoreOptions {
    /** Timeout primitive; tests inject a deterministic one. */
    wait?: (ms: number) => Promise<void>;
    /** How long to await the unawaited Host default write. */
    timeoutMs?: number;
    /** Total fences, including one retry after a concurrent revision change. */
    attempts?: number;
}
/** Field writes restoring one complete Main selection; the Host replaces the section. */
export declare function mainDefaultOps(selection: MainSettingsView): SettingsPathOpView[];
/**
 * Restore the Main default captured before a Session-only model switch.
 *
 * Never throws and never blocks a Plan answer: a failed compensation is
 * reported, not enforced, because the Session selection the human asked for is
 * already installed by the time this runs.
 *
 * @param form - the official Main Settings namespace form.
 * @param before - the snapshot captured before the switch.
 * @param options - wait/timeout/attempt overrides for tests.
 * @returns Whether the captured default stands again, and whether a newer edit won.
 */
export declare function restoreMainDefault(form: MainDefaultForm, before: ConfigFormSnapshot<MainSettingsView>, options?: MainDefaultRestoreOptions): Promise<MainDefaultRestore>;
