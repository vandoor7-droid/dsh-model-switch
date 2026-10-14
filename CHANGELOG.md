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
