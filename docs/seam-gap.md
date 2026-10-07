# Missing official seams

Official DSH is a read-only dependency. This plugin degrades on a clean tag when a seam is absent.

## Goal creation from a client slot

- **Needed for:** arming a reviewed Plan as the session's goal before its review is answered, so `dsh-goal-round-driver` carries the Plan after plan mode exits.
- **Where used:** `src/picker/plan-goal.ts`, `src/client/picker/PlanReviewCard.tsx`, `src/client/picker/install.tsx`.
- **Status: released, though DSH's own surface deliberately does not use it.** `@deepseek-ai/dsh-goal` publishes `remote.goals.create` (`@Remote('create') remoteExportCreate`, resolved from the wire session identity) and `@deepseek-ai/dsh-api-remotes` wires it into the generated client face — its own e2e calls `client.remote.goals.create(rootAgent.id, { objective: 'root goal' })`. DSH's shipped `dsh-client-ui-goal` nevertheless documents *Goal creation remains outside this package* and routes only `get` / `edit` / `pause` / `resume` / `clear`, leaving `/goal <objective>` as the human creation path.
- **Handling:** the card drives `create` (and, to replace an unfinished goal, `get` + `clear`) through a structurally typed face resolved **per render** with `ctx.get('remote.goals', false)` — never through this plugin's static `inject` list, because a dotted-service inject would block the whole client plugin on a deployment that mounts no goal package. Absent the service the action reports `unsupported` and disables itself while every other Plan Review action keeps working.
- **Upstream:** nothing to request while the remote stays published; if a future Host drops `create` from the client face, `setPlanAsGoal` already reports `unsupported`. Recorded for the roadmap: a programmatic create entry in the shipped goal surface would let plugins set a goal without probing the remote face themselves.

## `session.selectModel` default-write ordering

- **Needed for:** compensating the deployment-default write that `session.selectModel` performs alongside a Session-only switch, so the Main default a human configured in Settings survives a picker change.
- **Where used:** `src/client/picker/main-default-restore.ts`, `src/client/picker/install.tsx`.
- **What changed:** on `0.1.2-alpha.4` the controller awaited `agentDefaultModel.saveSelection(selected)` before resolving `selectModel` (`packages/api/session-controller`, `lib/index.js`: `try { await this.ctx.agentDefaultModel.saveSelection(selected) } catch …`). On `0.2.0-rc.2` the same step is fired, not awaited: `void this.ctx.agentDefaultModel.saveSelection(selected).catch(…)` (`packages/api/session-controller/src/commands.ts`, `selectModel`). The RPC therefore resolves *before* the namespace revision moves, and no `captured + 1` revision fence can be assumed.
- **Handling:** wait for the namespace revision to leave the captured one (bounded, resolved by the form's own subscription), then fence on the revision actually observed, retry once against a concurrent edit, and never throw. A restore that cannot be completed is reported after the Plan answer instead of blocking it. No Core patch.
- **Upstream:** the ordering is not part of the released contract; either awaiting the default write or publishing a Session-only selection entry point would remove the compensation entirely. Until then this module carries the difference.

## `session/writer-held` on a resumed Session

- **Observation:** the Host maps an in-process/lease `SessionAlreadyOwnedError` to `RemoteError('session/writer-held')` when a Session is created, adopted, or resumed for write (`packages/api/session-controller/src/agent.ts` `resolve`, `commands.ts` `rejectCreation`), and official clients render `error.sessionInUse` for it. A second frontend attached to the same Session is the documented cause.
- **Handling:** this plugin does not interpret, mask, or retry that code. Every action it performs keeps the code visible (`planErrorText`), and a takeover is never left with every action disabled, so the human can always act on it.
- **Upstream:** nothing to request here — the seam is a Host ownership decision, not a missing interface.

## `ctx.settingsScope` on non-loopback browsers

- **Needed for:** durable Main / Model Switch namespaces on the trusted lab HTTPS origin.
- **Where used:** `src/client/remote-settings-scope.ts`, `src/client/index.tsx`.
- **When missing / memory-only:** official `ui-settings` keeps process-local memory mode on non-loopback pages. The plugin then uses the public `remote.settings` describe/mutate RPCs (not a DSH core patch) so the settings page remains writable through `dshlab.noirbright.top`.
- **Upstream:** a public `settingsScope` persistence flag for trusted remote Hosts. Until that ships, keep the Remote adapter and this note.
