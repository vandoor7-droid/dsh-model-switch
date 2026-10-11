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

## Rendering `conversation.plan-review.actions` from a composer takeover

- **Needed for:** restoring the official plan-preview affordance (auto-open of the full plan in the right sidebar plus the manual opener) while this plugin's card replaces the official QuestionComposer in the `conversation.composer` chain.
- **Where used:** `src/client/picker/plan-preview.ts`, `src/client/picker/PlanReviewCard.tsx`.
- **What's missing:** two independent rules block the sanctioned path. The SlotRegistry allows exactly **one declarer per child slot** (`register` throws `slot "…" is already declared`), and official `ui-user-questions` already declares `conversation.plan-review.actions` on its own QuestionComposer entry; separately, `renderSlot` dispatch authorizes against the **rendering entry's own children table** (`SlotOwnershipError`), which a takeover entry cannot obtain. Declaring the key ourselves would therefore throw at registration — in this plugin or in the official panel, depending on load order.
- **Handling:** the card reads the public slot ledger (`slots.entries('conversation.plan-review.actions')`), resolves ui-plan's registered entry by its stable id, and drives its inject face (`openReview` + `hooks.sidebarMounted`). The `dsh-resource://plan-review` address, logged-plan branch, subagent routing, and mounted-session gate all stay inside ui-plan; without ui-plan every operation degrades to "unavailable" and the card keeps working.
- **Upstream:** either allow a shared child-slot declaration (many parents rendering one child list) or publish a `renderSlot`-equivalent that dispatches to any *declared* slot, so a takeover entry can render official child affordances without re-deriving them. Exporting ui-plan's `PlanReviewOpen`/`reviewPreviewAddress` as a supported face would be a narrower alternative.

## Configurable Auto-reviewer model

- **Needed for:** letting a human pin the reviewer model for the official per-call Auto gate instead of always reviewing on the session's own route.
- **Where used:** `src/auto-review.ts` (row `model-switch-auto-review`), `cordis.patch.yml`.
- **What's missing:** `@deepseek-ai/dsh-experimental-auto-review` exports only `name` / `inject` / `apply`; `classifyRisk` hardwires `provider/model` from `header.config` and `dsh-llm` publishes no interception or per-call caller seam ("Requests use raw fetch… no shared proxy or interception configuration"). `GenerateOptions` also carries no effort field, so no effort override exists.
- **Handling:** the official `apply` runs unchanged under `ctx.extend({ llm })`, whose wrapper rewrites only `stream()`'s `provider/model` when both settings fields are set (identity passthrough otherwise), with the route re-read per call. The official row is disabled through the public patch (one `registerAuto`), and the wrapper mounts only when the profile started with the optional auto-review bundle, so a profile that never opted in gains neither the gate nor the preset. An already-active official row is reported, never double-registered. If a future official `apply` closes over a different llm lookup, this shadow stops applying — recorded as the accepted coupling.
- **Upstream:** an official `reviewModel` config (or a `GenerateOptions.caller`/route-override option on the gate) would remove the shadow entirely.

## Threshold-driven plan-exit compaction

- **Needed for:** compacting long history with the switched-to model *before* a switched plan approval resumes the session, so the first execution request does not time out.
- **Where used:** `src/plan-compact.ts`, `src/capabilities-rpc.ts` (endpoint `plan-compact`), `src/client/picker/PlanReviewCard.tsx`.
- **What's missing:** there is no official plan-exit hook, and the idle-only `compactNow` seam is unusable at plan exit — `exit_plan_mode` awaits `interaction.ask(...)` inside a live tool call, so `agent.phase.kind === 'running'` and `runMaintenance` throws `already has active work`. The turn-safe `compactIfNeeded(agent, 'context-overflow')` (official overflow recovery's own operation, threshold-free with `retainTokens: 0`) is the closest released entry, but its trigger name is semantically "a provider already rejected the request".
- **Handling:** the card asks the Host over this plugin's own RPC before committing anything; the Host measures with `ctx.tokenMeter` (larger of the two envelope prices), compares against the user's threshold, and drives an isolated `compaction-basic` engine pinned to the switched-to route via `compactIfNeeded(..., 'context-overflow')`. Failure keeps the Plan pending and retryable; `null` (nothing compactable) proceeds after a notice; threshold 0 disables. No transcript notices are appended while the ask tool is suspended — the compaction's own durable marker pair and summary replacement are the record.
- **Upstream:** an official pre-plan-exit/pre-answer hook (or a named "manual, turn-safe" `compactIfNeeded` trigger, and/or a public session-level `compactFor(route)` entry) would let plugins express this without borrowing the overflow trigger's name.
