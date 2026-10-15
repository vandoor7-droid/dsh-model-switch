import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'

/** One field-level change expressed against a view model, before source-path mapping. */
export interface ConfigViewOp<T> {
  field: keyof T & string
  value?: unknown
}

export interface ConfigViewForm<T> {
  getSnapshot(): ConfigFormSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: keyof T & string, value: unknown): Promise<void>
  unset(field: keyof T & string): Promise<void>
  /**
   * Apply several view-field changes as ONE revision-fenced source write, so a row save
   * either lands completely or is rejected as a whole instead of leaving a half-written pair.
   *
   * @param ops view fields to change; `value === undefined` unsets the source field
   * @param expectedRevision revision the draft was seeded from; forwarded to the source fence
   * @returns a promise that rejects with `settings-rejected` when the host refuses the write
   */
  mutate(ops: readonly ConfigViewOp<T>[], expectedRevision?: number): Promise<void>
}

export function deriveConfigForm<Source, View>(
  source: ConfigForm<Source>,
  project: (value: Source) => View,
  fields: { [K in keyof View & string]: keyof Source & string },
): ConfigViewForm<View> {
  let sourceSnapshot: ConfigFormSnapshot<Source> | undefined
  let viewSnapshot: ConfigFormSnapshot<View> | undefined
  const getSnapshot = (): ConfigFormSnapshot<View> => {
    const current = source.getSnapshot()
    if (current === sourceSnapshot && viewSnapshot !== undefined) return viewSnapshot
    sourceSnapshot = current
    const next = { ...current, value: current.value === undefined ? undefined : project(current.value) }
    viewSnapshot = next
    return next
  }
  const write = async (operation: 'set' | 'unset', field: keyof View & string, value?: unknown): Promise<void> => {
    const sourceField = fields[field]
    const accepted = operation === 'set' ? await source.set(sourceField, value) : await source.unset(sourceField)
    if (!accepted) throw new Error('settings-rejected')
  }
  /**
   * Batch write: map every view field through the same `fields` table `set`/`unset`
   * use, so one atomic source mutate can carry a whole row's worth of edits under
   * a single revision fence instead of N independent fenced writes.
   */
  const mutate = async (ops: readonly ConfigViewOp<View>[], expectedRevision?: number): Promise<void> => {
    // The view model types values as unknown; they are settings-editor JSON values,
    // which is exactly the set-op wire shape.
    type SetOpValue = Extract<SettingsPathOpView, { op: 'set' }>['value']
    const mapped: SettingsPathOpView[] = ops.map(op => (
      op.value === undefined
        ? { op: 'unset', path: [fields[op.field]] }
        : { op: 'set', path: [fields[op.field]], value: op.value as SetOpValue }
    ))
    const accepted = await source.mutate(mapped, expectedRevision)
    if (!accepted) throw new Error('settings-rejected')
  }
  return {
    getSnapshot,
    subscribe: listener => source.subscribe(listener),
    set: (field, value) => write('set', field, value),
    unset: field => write('unset', field),
    mutate,
  }
}
