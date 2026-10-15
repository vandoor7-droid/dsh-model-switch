## v0.4.25

Three coordinated changes: Provider groups now cover all four per-session capabilities (compaction, auto review, session naming, and subagents) with mid-session provider-switch following; capability switches stay disabled until the model catalog has loaded (and while any row save is in flight) so clicks are never silently dropped; and send-time switch compaction (`compactOnSwitch` / `src/switch-compact.ts`) has been removed completely.

- **Provider groups cover compaction, auto review, session naming, and subagents per session.**
  - **Compaction (`src/compaction.ts`):** `mountEngine` mounts the official `BasicCompactionEngine` under `compactionScope(ctx)` (`ctx.extend({ llm: compactionLlm(...) })`). When `options.purpose === 'compaction'` and `options.sessionId` resolves to a session in `ctx.sessions`, `compactionLlm` derives the session's provider (`pending` selection preferred over `lastUsed`, then logged routes), resolves **provider group → flat compaction card → engine default**, and updates `options.provider` / `options.model` in place before delegating to `real.stream(options)`. Because `summarizeWithLlm` returns `{ provider: options.provider, model: options.model }`, the durable `compaction/summary` record always matches the exact model that wrote the summary, and edits to `providerGroups` apply to the very next compaction with zero engine remounts.
  - **Auto review (`src/auto-review.ts`):** Immediately after running `official.apply(scope)`, `bindAutoReviewSessionCorrelation` registers a `{ prepend: true }` `tools/pre-execute` listener on the review scope — which Cordis places ahead of the official gate's own prepended listener in the waterfall — and binds `exec.agent?.session` in an `AsyncLocalStorage` scope around `next()`. When `classifyRisk` calls `scope.llm.stream(options)`, the wrapper reads the active session, resolves **provider group → flat reviewer card → session model**, and passes a shallow copy of the frozen options with the resolved route. Parallel sessions on different providers therefore review on their own configured models without cross-session interference, and mid-session provider switches take effect on the very next review.
  - **Provider groups UI (`src/client/ModelSwitchSettings.tsx`):** Restored the **压缩模型 (`compaction`)** and **自动审查模型 (`autoReview`)** rows alongside **会话命名模型 (`sessionTitle`)** and **子代理默认路由 (`subagent`)** in the Provider groups card, seeded unsaved groups from all four active cards, and automatically reactivated stored `compactProvider`/`compactModel` and `autoReviewProvider`/`autoReviewModel` entries from v0.4.22/23 without migration.
- **Fixed intermittent unresponsive capability switches (`src/client/ModelSwitchSettings.tsx`).** Previously, clicking a capability switch (such as Session naming) before the async model catalog finished loading — or while another card's save was in flight — hit a silent `return` in `persist*Enabled` / `run()` while the `InstantSwitch` itself rendered enabled. Every switch's `disabled` prop now reflects `busy !== undefined`, `!writable`, `value === undefined`, and `catalogSeed === undefined` when enabling a seed-dependent route.
- **Removed send-time switch compaction (`compactOnSwitch` / `src/switch-compact.ts`).** Removed the Send protection (`发送保护` / `切换时压缩`) setting, UI section, and `agent/pre-step` hook. All compaction policy and triggers now belong exclusively to DSH's official compaction engine (`/compact` and automatic pressure/overflow compaction).

## v0.4.24

Three coordinated changes: session naming gains a configurable model; provider groups (and the Default Subagent route) become per-session derived policy instead of a write, fixing sessions on different providers overwriting or redirecting each other's auxiliary routes; and every settings row save becomes one atomic revision-fenced mutation, fixing the save-while-running freeze, half-written provider/model pairs, and the ambiguous ⚠ marker.

- **New: session-naming model card.** The settings page now configures the model behind DSH's automatic session titles. Off (both fields empty) is the official behavior — naming follows the session's own model; On pins a provider/model. The route is **read through on every naming request**, so a saved change applies to the very next title with no restart, and a naming request already in flight is never interrupted by a save. Each request resolves the session's provider group first, then the flat pair, then the session's own model, and the official implementation records the exact pair used in the session's own `session/title-llm-request` event — the durable record and the real request can never disagree. The plugin replaces the official `session-title-llm` row (the seam allows one registered naming provider per context) and mirrors the cadence that row declared; because a `disabled` row is not an instantiated loader entry, a profile where the displaced row cannot be inspected mirrors the shipped first-prompt cadence rather than dropping model-backed naming.
- **Provider groups are derived, not written (cross-session overwrite fixed).** Previously a provider switch *wrote* the group's routes into the shared deployment-wide fields, so two sessions on different providers could overwrite or redirect each other's auxiliary routes — a real cross-session hazard. Now a group saved for provider X merely applies to the sessions whose own provider is X: the Host resolves **group pair → flat deployment-wide pair → official default** per session and per request, and switching a session's provider writes NOTHING. The group editor therefore covers exactly the session-naming and subagent routes; auto review and compaction stay deployment-wide cards (the official auto-review gate exposes no session identity at its interception point, and the official compaction transaction durably records the provider/model that wrote its summary — both recorded in `docs/seam-gap.md`). The stored configuration format is unchanged and no migration runs: an older entry may still carry its compaction/auto-review fields, and they are ignored.
- **Subagent routing follows the delegating session.** A spawn that names no provider, model, or effort is routed with the delegating session's derived route (its provider group's subagent pair and effort, else the fixed card), so sessions on different providers route their own spawns. A caller that names a route is never overridden, and a provider whose capability is not `agentOptions` (for example a one-shot process adapter) is never reinterpreted as an Agent-capable route; with nothing pinning, the request stays untouched — official inherit (parent live request, then creation snapshot).
- **Compaction stays deployment-wide by design, with a supported per-route alternative.** The official compaction transaction durably records the provider/model that wrote the summary, so rewriting the summarization call per session would make that record false. A deployment that needs route-scoped summarization uses the official exact-target `modelPolicies` array on the profile's `compaction-basic` row config — each entry matches one exact routed conversation target and overrides its policy including the summarization pair, and this plugin forwards that row config verbatim (YAML example in the READMEs).
- **Atomic settings writes (freeze / half-pair / ⚠ fixed).** Every row save is now ONE atomic, revision-fenced mutation through the official ConfigForm `mutate`: a refused write can no longer leave a half-written provider/model pair. A draft the user edited survives external snapshot updates; a conflict is reported with a reload path instead of silently losing either side; and a write that never settles is reported after 30 seconds instead of freezing the page on "保存中…". The ⚠ marker now means only "this value is not in the current provider catalog".
- **The switch-time compaction guard is never dropped.** The send-time guard is installed *before* the previous one retires, and a refused registration is reported while the live guard stays in place, so a failed refresh can no longer leave a session without switch-time protection for its remaining steps.
- **Documentation.** The settings-page inventory is documented as shipped — Subagent, Web search, Image generation, Auto review, Compaction, and Session naming route cards plus the Provider groups card — in `README.md`, `README.zh.md`, and `PRODUCT.md`, with the two deployment-wide justifications and the `modelPolicies` alternative recorded in `docs/seam-gap.md`.

- **Verification.** `pnpm run check` green (`tsc` + `tsdown`, 53 test files / 425 tests, pack gate). Reverse verification: inverting the group-vs-deployment precedence turns the resolver spec red, removing the draft's pristine guard turns the external-snapshot spec red, and restoring the retire-then-install guard order turns the guard-lifecycle spec red — each green again after restore. Lab 3082 smoke: the naming card's save arrives as ONE `settings/mutate` carrying both `titleProvider` and `titleModel`, the group editor lists exactly the naming and subagent rows, and session naming was checked in both modes — card off produced a model-generated title within seconds, the card pinned to the keyless `deepseek-official` route produced no title across three sessions, and the same card pinned to a working route produced a model-generated title within seconds, which is the differential that shows the pinned route is the one the naming request uses. Residual: the `session/title-llm-request` field itself was not read (the session store's concatenated zstd frames could not be walked offline, and the trace view did not render the event), so the route match rests on that differential; compaction and auto review remain deployment-wide by design (`docs/seam-gap.md`).

## v0.4.23

Three coordinated changes: the Main-default card is removed entirely; provider groups now apply on every switch surface of the seat session; and the subagent summary distinguishes a pinned effort from a provider default.

- **Removed: the Main model card and its protection.** The settings page no longer configures the deployment default — the provider/model/effort card, `saveMain`, the `agent-default-model` client contract (`MAIN_DEFAULT_CONFIG_ID`, `MainSettingsView`, `MainSettingsConflictError`), the Host-side `mainDefaultPort`/`currentMainSelection`/`saveMainSelection` surface (and the runtime's `agentDefaultModel` inject), and the whole pre-switch capture / revision-fenced restore module (`main-default-restore.ts`, removed with its spec) are gone. The picker switch itself is now never gated on settings state (the previous writable-Main admission guard, including the non-loopback `settings.*` notices and the Plan Review card's settings-blocking path, is deleted). **Behavior and migration:** the plugin neither reads nor writes the deployment default; like a native TUI switch, a picker switch lets the Host's own default write take effect, so a new session starts on whatever was last used. To pin a fixed default, use DSH's own **Settings → Models** page. Remaining capability switches (auto review, compaction, subagent) seed their On state from the catalog head instead of Main, and the group editor's row-enable seeds from that capability's live route with the same catalog-head fallback. `PlanCommitOutcome` is now `{ committed }` only (plugin-internal, ships together).
- **Provider groups watch the session, not just the plugin.** A new watcher (`provider-group-watch.ts`, one per seat session, shared by both slot faces) observes the official model-selection directory projection — whose only `model/selection` emitter is the `session.selectModel` RPC — so the target provider's saved group now applies whenever **this session's model provider** changes, whether the switch came from this plugin's picker, the TUI, or another client. Semantics are unchanged: a provider without a group, a model-only change within one provider, and the subscription baseline write nothing; applies are serialized with coalescing to the latest target; a failed apply logs `dsh-model-switch: provider group apply failed` and never disturbs the switch. Residual boundary: the watcher exists only for sessions open in this Web UI. Settings copy reworded from "主模型切换" to "会话模型切换" (zh/en).
- **Subagent summary effort wording.** The Default Subagent route card now shows 「已固定 · High」 (locale `effortPinned` / `Pinned`) when an effort is stored and 「Provider 默认 · High」 when the route follows the provider default, with the effort rendered through the catalog's localized name (same lookup the picker uses) instead of the raw id. Previously every fixed route read "Provider 默认 · …" regardless.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 52 test files / 370 tests, pack gate); reverse verification — restoring the picker's inline group apply turns the watcher integration red, breaking the watcher baseline/coalescing turns exactly its unit spec red; lab 3082 smoke: the settings page shows no Main card, a picker provider switch still applies the stored group, a second browser tab switching the same session drives the first tab's cards to follow, the subagent summary reads 「已固定 · High」 when pinned and 「Provider 默认 · …」 when unset, group-less providers leave routes untouched, and switching is no longer blocked by settings state.

## v0.4.22

One addition: per-provider capability groups — save the compaction, subagent, and review routes together for a provider, and apply that group automatically when the main model's provider changes.

- **Provider groups.** New settings card (供应商配置组 / Provider groups) stores one route group per provider in the existing shared `model-switch` namespace (`providerGroups`, an entry array normalized to a provider map) covering exactly the three session-level capability routes — compaction, subagent, and auto review; search and image stay out of scope. Applying a group is a **full replacement** through one ordered write sequence: the pinned pairs are set, pairs the group does not pin are unset as a pair (never a half pair), and `subagentMode` is written last (`fixed` when the subagent pair is pinned — with its effort only when the effort is non-blank, blank meaning the provider default — else `follow-main`), so every unpinned capability reverts to its own default. Two plugin-owned switch surfaces trigger the apply: the composer picker's `directoryFace.select()` and the Main card's `saveMain()`, both gated on an actual provider change; a same-provider switch, a provider without a stored group, or any other switch surface (TUI) writes nothing. The apply rides the public ConfigForm `set`/`unset` onto the existing flat settings fields, so the consumers (`compaction.ts`, `subagent-runtime.ts`, `auto-review.ts`) are untouched, and the effect is profile-level like the fields it writes. Failures never fail the switch or the Main save: the picker logs a warning and still commits, while the Main card surfaces "Main model saved, but applying the provider group failed …". In the editor, a provider's draft seeds from the active routes the first time it is configured, each capability switch seeds from Main when turned on and stores the capability default when off, applying a group overwrites the three standalone cards (including manual edits, stated in the card copy), and **Delete group** removes the provider's entry (clearing the stored field when the last group goes, no-op when nothing is stored).
- **Storage and typing.** `providerGroups` is a `z.array(entry).default([]).volatile()` field on the exported `Config` (annotated explicitly so declaration emit stays inside this package), coerced per entry with `''` defaults; `normalizeProviderGroups` never throws, accepts both the stored entry array and a hand-written provider→routes record, drops blank fields, unknown fields, and blank/duplicate entries, and treats a literal `__proto__` provider id as data. `readConfig` omits the field when no group exists, keeping the exact empty-config shape unchanged.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 52 test files / 386 tests, pack gate); reverse verification — removing the picker's apply wiring turns exactly the adopt test red, green again after restore; lab 3082 smoke: two stored groups (one pinning compaction onto the keyless `deepseek-official` route, one onto a working route) apply on a picker provider switch (all three cards show the group values, switching back restores the previous routes), no-group providers leave the routes untouched, and `/compact` under the keyless pin fails with that route's `MISSING_CREDENTIAL` while the working group summarizes normally.

## v0.4.21

Two product changes and one investigation: plan-exit auto-compaction is removed entirely; official compaction (`/compact` and official automatic compaction) gains one configurable summarization model; and the "endless automatic compaction" reports are investigated and attributed to the official engine.

- **Removed: plan-exit compaction (0.4.20).** The plan-exit auto-compaction feature ships no more: the `plan-compact` plugin RPC endpoint, the Host runner, the card call, and the `planCompactThreshold` setting are gone, and plan approvals commit immediately as they did before 0.4.20. Switch-time compaction (`compactOnSwitch`, the fork's original send-time protection) is untouched and still optional.
- **Compaction model.** New settings card (default **off = official default = the conversation target model**; on seeds from Main) pins the summarization route for **all** official compaction — `/compact` and official automatic compaction alike. `dsh-model-switch/compaction` mounts the **same official `BasicCompactionEngine`** with the official row's own config forwarded unchanged and only `summarizationProvider`/`summarizationModel` overlaid when both settings fields are set (either field alone is ignored). Reaching the engine takes two row replacements: the top-level `compaction-basic` row (surfaces that compose the agent process-wide, e.g. the TUI) and — because the Web surface runs session compaction inside each agent preset's isolated `compaction` group, which profile patches cannot address — a wholesale replacement of the shipped preset rows (the Web preset editor's own save mechanism) that swaps that group's engine for the routed one; the preset copies are re-synced per DSH release during the existing compatibility verification. The engine remounts dispose-first whenever the composed config changes (`model-switch/settings-update`, emitted on ordinary and volatile saves; the listener is global so preset-realm instances hear it), and the initial mount is awaited so `/compact` resolves the service the moment the row completes. Failure ladder: configured route → official defaults → unmounted, each step with explicit errors. Saving while a compaction is running may interrupt it; it retries next time.
- **Known issue (upstream): official automatic compaction churns under sustained context pressure.** While the working set stays above the engine's pressure threshold (`thresholdRatio`, default `0.8 × target context window`), every `agent/pre-step` attempts compaction; once the remaining compactable ranges are small, the official "summary is not smaller than the shadowed content" guard rejects the summary and the next step retries the same range — a visible loop of automatic compactions. A session-level A/B pinned the source to the official engine, not this plugin: 180 compaction events in one session (62 rejected summaries, 1–2 attempts per step for hours), churn active only while the active model's window kept the threshold crossed, identical before and after disabling this plugin. Mitigations: set `auto: false` (keeps `/compact`) or raise `thresholdRatio` on the compaction-basic row config — this plugin forwards row config unchanged; reduce mounted tool schema; or pin a compaction model that produces leaner summaries. Recorded for upstream in `docs/seam-gap.md`.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 51 test files / 349 tests, pack gate); reverse verification — breaking the route overlay or the official-row forwarding turns the compaction tests red, then green again after restore; lab 3082 smoke with the shipped patch only: a keyless `compactProvider` pin makes `/compact` fail with that route's `MISSING_CREDENTIAL`, saving a working pin applies on the very next `/compact` without a restart, and an empty pair summarizes via the conversation target; auto-review runtime check on 3082: a pinned reviewer route receives the review call (tool bodies stay blocked when it fails), pin off reviews follow the session model.

## v0.4.20

Three coordinated additions: the Plan Review card shows only the official summary and restores the right-sidebar full-plan preview; the official Auto reviewer's model becomes configurable; and switching models at plan exit compacts long context first.

- **Plan Review body = summary, full plan in the sidebar.** The card renders the official two-part summary (`extractMarkdownPlainText` first-line + first-paragraph) instead of the whole document, with a "View full plan" header action. The full plan auto-opens in the right sidebar by driving ui-plan's registered preview opener: a composer-takeover entry cannot render `conversation.plan-review.actions` (one declarer per child slot, plus per-entry `renderSlot` authorization), so the card drives ui-plan's own inject face — address, params, logged-plan branch, and mounted-session gate all stay ui-plan's. `planReviewOf` now passes `intent.callId` through, matching the official narrow. Recorded in `docs/seam-gap.md`.
- **Auto review model.** New settings card (default **off = reviews follow the session model**; on seeds from Main) pins the reviewer route in the shared `model-switch` namespace. `cordis.patch.yml` disables the official `auto-review` row and inserts `dsh-model-switch/auto-review`, which runs the **same official `apply`** under a scoped child context whose `llm.stream` `provider/model` are rewritten only when both settings fields are set (identity passthrough otherwise, route re-read per call). The row mounts only when the profile started with the optional `@deepseek-ai/dsh-experimental-auto-review` bundle and reports an already-active official row instead of double-registering. Optional peer `@deepseek-ai/dsh-experimental-auto-review >=0.1.7-rc.2` (lowest verified; the devDep pins the matching 0.1.7-rc.2 line).
- **Plan-exit compaction.** When an approval switches provider/model and the estimated next request exceeds the new threshold (tokens, default 200,000, `0` disables, edited in the Send protection group), the card calls a new `plan-compact` plugin-RPC endpoint **before** committing anything: the Host prices the session with `ctx.tokenMeter` (larger of the two envelope prices) and, over threshold, summarizes once through an isolated `compaction-basic` engine pinned to the switched-to model via the turn-safe `compactIfNeeded(..., 'context-overflow')` — `exit_plan_mode` awaits its question inside a live tool call, so the idle-only `compactNow` cannot run at plan exit. Then the model commits and the review answers; **Set as goal and run** compacts before arming the goal. Same-model or effort-only approvals never trigger the endpoint, an empty history proceeds after a notice, and a failed compaction keeps the review pending and retryable. Seams and the borrowed overflow trigger are recorded in `docs/seam-gap.md`.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 50 test files / 348 tests, pack gate); reverse verification — restoring the full-plan body, removing the switch gate, and dropping the route rewrite each turn the targeted tests red, then green again after restore.

## v0.4.19

Plan Review gains a **Set as goal and run** action: it arms the reviewed Plan as the session's goal and only then answers it, so `dsh-goal-round-driver` carries the Plan after plan mode exits.

- The goal is set before the answer, matching the card's existing commit-then-answer order; a refusal keeps the review pending and reports the Host's own wire code.
- An unfinished goal is replaced through `get` + `clear` + `create` rather than edited, so a new Plan starts with a fresh round cap, and the card says it replaced the previous goal.
- The goal face is resolved per render (`ctx.get('remote.goals', false)`) instead of listed in the static client `inject`, so a deployment that mounts no `@deepseek-ai/dsh-goal` keeps loading this plugin and the action disables itself with an explicit reason while the other three actions keep working. `@deepseek-ai/dsh-goal` is declared as an optional peer.
- The objective is the Plan's trimmed markdown. The plugin stores no goal state, owns no part of the goal domain, and schedules no rounds.
- Records the seam in `docs/seam-gap.md` (the released `remote.goals.create` exists while DSH's own goal surface deliberately omits creation) and the action in PRODUCT.md and both READMEs.

## v0.4.18

Declare official DSH `0.2.0-rc.2` compatible in `package.json#dsh.compatibility.dshReleases`.

Evidence, in the order this repository's compatibility policy requires:

- **Public API review:** the 0.2.x Host renamed the pending-question withdrawal verb (`PendingQuestion.cancel()` → `dismiss()`), fires `session.selectModel`'s deployment-default write without awaiting it, and reports a refused `ModelDirectory.select` as a returned `{ ok: false }` value instead of throwing. Each difference broke v0.4.16, and each is fixed in v0.4.17.
- **Tests and build:** `pnpm run check` green — `tsc` + `tsdown`, the full vitest suite, and the pack gate against a real tarball.
- **Lab plane:** profile composition `exit 0` with no skipped bundle, Host boot on port 3082 with the plugin's capability RPC answering, and the npm-installed build booting on port 3085 with its client bundle served.
- **Live desktop verification on 0.2.0-rc.2:** all three Plan Review actions exercised against a real session — Discuss withdraws the takeover and returns the composer; Reject delivers typed feedback verbatim as the answer's `custom` text; Confirm commits a different execution model, approves the plan, and restores the Main default to its pre-switch value.

## v0.4.17

First release published to the npm registry, so `dsh plugin --profile <name> add dsh-model-switch` installs prebuilt code without a git build authorization. Publishing builds `lib/` through `prepublishOnly`, and `pnpm run check` now runs its pack gate on Windows as well.

- Plan Review **Discuss in chat** now withdraws the takeover through the verb the running Host publishes (`PendingQuestion.dismiss()` on 0.2.x, `cancel()` on 0.1.x) instead of calling `cancel()` unconditionally, which threw on a Host that renamed it; a Host exposing neither is named explicitly.
- Plan Review **Reject** sends text from the card's feedback field as the answer's `custom` text, so a rejection reaches the model with what to change instead of a bare option label.
- Compensate the deployment default through the namespace revision actually observed: wait for the Host's unawaited `session.selectModel` default write, fence on the observed revision, retry once against a concurrent edit, and never fail the answer. The previous `captured + 1` fence assumed an awaiting Host and could either refuse the restore (leaving the Plan unanswerable) or silently leave the Main default switched.
- Treat a refused official `ModelDirectory.select` result as an uncommitted model change instead of reporting success.
- Keep Confirm and Reject closed after a settled review while Discuss and a reload affordance stay reachable, and surface the wire code of a failed action.
- Fix a line-ending fragile mobile width-budget assertion.
- Make the pack gate portable: resolve npm's own CLI when a shell-less spawn cannot launch the Windows `.cmd` shim, compare archive members across line endings, and link the extracted package with a junction on Windows.

## v0.4.16

- Bundle shared Provider UI helpers from the published v0.2.14 release.
- Apply the official menu backdrop material and preserve picker focus through model selection, pane changes, and search dismissal.
- Keep search autofocus and return focus to the trigger when Escape closes the summary.
- Verify official DSH 0.1.7-rc.2 with open-ended Host dependency ranges.

## v0.4.15

Accept DSH releases from 0.1.7-alpha.2 onward through open-ended peer and development ranges. Rebuild and verify against official 0.1.7-rc.1 without changing model routing behavior.

## v0.4.14

Target official DSH `0.1.7-alpha.2`, pin Provider UI `0.2.12`, and move Main, Subagent, search, image, and compaction controls to published ConfigForms. On non-loopback browsers the official forms are memory-only: Settings shows an explicit unavailable state and the picker refuses selections that would otherwise persist a deployment-wide default without a safe restoration path.

## v0.4.13

Replacement Subagent runtime exposes public `resolveMaxDepth` so Host 0.1.6-alpha.2 Standard remount keeps Model Switch routing. Compile target stays `0.1.5-rc.1`.

## v0.4.12

Optional Default Subagent route (Official inherit when off) and Switch compaction as a Send protection B-row.

## v0.4.11

Rank live catalogRoutes. Compact-on-switch uses previous-provider usage when present.

# Changelog

## [0.4.10] - 2026-09-13

- Include completion notices in the send-time budget; verify concurrent sessions, retained-input retry, live progress, and durable notice replay through the real agent loop.
- On send, when the assembled target model or context-tier id differs from the last request, check the pending request against the target window and compact once with the previous model if needed. Picker-only changes do no work. Default on; Settings → Model Switch can turn it off without disabling DSH automatic compaction.
- DSH Host packages are no longer version-locked. `@deepseek-ai/dsh-*` peers are `*` and optional; unknown Hosts warn once and still mount. Cordis stays `>=4.0.2 <5.0.0`. Compile-target `devDependencies` remain `0.1.5-rc.1`.
- Keep Fast / Context / Thinking / Effort switches on the current Agent after a turn; disable unpublished sibling rows instead of ignoring clicks.
- Composer picker Cursor mark comes from `dsh-llm-providers-ui` 0.2.6.

## [0.4.9] - 2026-09-09

- Reserve the selected execution runtime as soon as a prompt is submitted, before the first token or native binding.
- Native Antigravity keeps its models and effort; DSH keeps LLM-provider choices and disables Agent providers until cancel or a durable native binding.

## [0.4.8] - 2026-09-07

- Development dependency now points at the final `dsh-llm-providers-ui` 0.1.10 release URL with pinned integrity; Alpha.4 fixtures updated coherently (roots + provider identity + fresh self-root tarball).

## [0.4.7] - 2026-09-06

- Unify provider-owned independent Web search metadata and execution for DeepSeek, Codex and Grok through the existing adapter registry and authenticated capability RPC.
- Reuse official DeepSeek search settings/credentials and preserve the deployment’s complete Web config, including fetchProvider. Global search routing remains an explicit opt-in with no silent fallback.
- Recover capability polling after transient failures and Host revision resets; skip unchanged heartbeats without hiding unload warnings or enabling stale saves.
- Preserve Antigravity session routing and released v0.4.6 runtime compatibility; correct picker test fixtures without weakening approval safety assertions.
- Coordinate with Codex 0.3.14, Grok 0.3.11 and Provider Directory 0.1.9; install and validate immutable packages in lab before production promotion.

## [0.4.6] - 2026-09-03

### Changed

- DSH compatibility declarations cover the verified Alpha.4 and rc.1 runtimes.
- Unknown runtimes warn once and use the normal best-effort mount path; only reproduced failures may be blocklisted.


## 0.4.2

- Settings → LLM Providers: drag cards to reorder; chat picker follows `llm-providers.order` via dsh-llm-providers-ui.


## 0.4.3

- Keep a Host-accepted composer selection visible while its durable Session projection catches up, then return authority to newer projected selections.

## 0.4.1 - 2026-08-29

- Support DSH 0.1.2-alpha.1 through the public Cordis, Settings, Remote, Session, and Model Directory services after the monolithic client runtime removal.
- Carry fixed Subagent reasoning effort on alpha.1.
- Let the composer model trigger use the full available seat width on mobile instead of clipping long model labels.
- Keep Composer and Plan model switches session-local with a revision-fenced Main-default restore where the Host couples session selection to deployment defaults.
- Publish bilingual product documentation and screenshots, including the provider-catalog rules for custom Picker families.

## 0.3.11 - 2026-08-27

- Lock the real composer UI path for independent Context 1M and Fast On selection: when the provider catalog publishes a combined `*-1m-fast` row, the picker preserves both dimensions and submits that exact model id.
- Document through regression evidence that providers must publish the combined row; separate `*-1m` and `*-fast` rows cannot represent both dimensions simultaneously.

## 0.3.10 - 2026-08-27

- Keep mobile picker triggers, headings, model names, catalog descriptions, and values readable by rendering and wrapping instead of truncating.
- Resolve optional mobile interaction operations only through Cordis's typed public non-strict service lookup.
- Consolidate each picker snapshot and its operations into one render view backed by the official directory status/routability contract, retaining selected routes absent from the advisory catalog.
- Isolate popup activation, positioning, and dismissal in a deep internal module.
- Keep composer and Plan Review picker crashes mounted as localized, retryable diagnostics.
- Preserve Plan Review's one-row mobile footer while shrinking controls and wrapping action labels inside their buttons at narrow widths.

## 0.3.9 - 2026-08-27

- Preserve the 320px preferred picker width whenever the mobile viewport allows it, shifting away from the trigger instead of squeezing to 240px.
- Hide horizontal list overflow while retaining vertical scrolling, removing the mobile horizontal scrollbar.

## 0.3.8 - 2026-08-27

- Keep a mobile pointer's open/close intent idempotent through the 750ms tap-fallback window so a detail-zero programmatic click cannot reopen a picker that the user just closed.

## 0.3.7 - 2026-08-27

- Make click the sole owner of picker toggle state so one mobile touch cannot open on pointerdown and immediately close on its synthetic click.

## 0.3.6 - 2026-08-27

- Restore non-strict lookup for the optional mobile interaction service; Cordis may reject direct undeclared-property access, which previously crashed the custom seat on render.

## 0.3.5 - 2026-08-27

- Declare the merged picker's Sessions and model-directory services in the client plugin's top-level injection contract so production completes the custom seat registration.

## 0.3.4 - 2026-08-27

- Contain composer-seat render/effect errors inside the merged picker so a crash cannot silently abdicate to the official picker; show a retryable diagnostic instead.
- Treat the Sessions face as optional while the public model-directory service gate is active.

## 0.3.3 - 2026-08-27

- Restore merged picker ownership of the composer model seat by matching the official service gate and using an unambiguous winning priority.
- Treat optional mobile interaction-surface failures as a graceful degradation instead of crashing and abdicating the custom seat to the official picker.

## 0.3.2 - 2026-08-27

- Match Model Switch route cards to the shared LLM Providers chrome: radius, fill, border, spacing, icon treatment, title weight, summary size, chevron, and expanded body.

## 0.3.1 - 2026-08-27

- Keep the Model Switch settings nav glyph after the official Settings shell redraws its SVG.
- Restore a visible platform-gray fill for collapsed route cards; every route remains collapsed on mount.

## 0.3.0 - 2026-08-27

- Absorb the composer model picker and Plan Review execution picker into this package.
- Plan Review uses the official warn-strip card, a short capsule trigger, and a two-level Model/Effort/Context/Fast/Thinking menu.
- One `dsh plugin add dsh-model-switch` now covers routing Settings and composer/Plan selection. Remove a standalone `dsh-composer-picker` install to avoid a second model seat.
- Picker trigger shows the family name plus distinct effort / Fast / context bits; duplicate context windows collapse to one menu row.
- Known limitations: Settings nav icon still patches official nav DOM (no public icon field, same pattern as usage-monitor).

## 0.2.0 - 2026-08-26

- Keep official `web_search` ownership and add a thin `model-switch` Web Search provider with Codex model routing.
- Add stable `generate_image` routing through optional Codex and Grok adapters, with provider-specific schemas regenerated after Image route changes.
- Add Search and Image settings cards while keeping Vision/read_image excluded.
- Preserve existing provider-specific image tools and `web_fetch` as rollback paths.


## 0.1.1 - 2026-08-26

- Ship compiled Host/Client `lib/` in the git tag so `github:…#v0.1.1` installs can boot.

## 0.1.0 - 2026-08-26

- Add Main default and follow-main/fixed Subagent model routing for DSH 0.1.1-rc.2.
- Resolve follow-main from the active parent request header before stale session options.
- Preserve inherited provider/model when rc.2 cannot carry reasoning effort.
- Leave Search, Vision, image reading, ordinary chat attachments, and image generation on their existing official/provider paths.
- Add localized Model Switch settings and clean plugin lifecycle integration.
- Keep ordinary chat attachments on the official DSH path.
