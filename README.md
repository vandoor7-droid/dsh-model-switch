# Model Switch

English | [中文](README.zh.md)

Choose one explicit route for the active session, Subagents, Web Search, image generation, Plan execution, and automatic session naming in DeepSeek Harness. Model Switch uses public DSH services and provider-owned adapters; it does not patch DSH Core or manage provider credentials.

<p align="center"><img src="docs/screenshots/composer-picker.png" alt="Composer Picker with Model, Effort, Context, and Fast controls" width="314"></p>

The picker retains keyboard focus when changing panes or closing search, without overriding search autofocus. Escape from the summary closes the picker and returns focus to its trigger.

## Routes

| Route | Behavior |
| --- | --- |
| Session model | The active conversation's provider/model/effort, changed by the Composer Picker or Plan Review only. The deployment default (new sessions) is DSH's own; the picker never writes it. |
| Subagent | When a spawn names no provider, model, or effort: the delegating session's derived route — its provider group's subagent pair, else the fixed card's pair; with neither, official inherit (parent live request, then creation snapshot). A spawn that names a route is never overridden; workflow overrides remain authoritative. |
| Composer Picker | Changes only the active session and submits the exact catalog model id. |
| Plan Review | Chooses the execution model before the Plan approval response is sent. |
| Web Search | Keeps official `web_search`; after deployment opt-in, routes through the selected, dynamically declared provider search adapter. |
| Image generation | Provides one stable `generate_image` tool routed through a selected Codex or Grok adapter. |

Invalid, unavailable, or unsupported routes fail explicitly. Model Switch never silently falls back to another provider or model. Composer icons identify the execution runtime: DSH-owned LLM routes use the theme-adaptive DSH whale; providers declaring the Agent role use their own mark. Sidebar quota icons remain provider-specific.

Idle blank sessions may pick an External Agent. Submission, pending-first-turn, and running state reserve the selected execution runtime even before a token or native binding exists: native Antigravity keeps its model/effort choices; DSH keeps LLM-provider choices but disables Agent providers. After the first accepted user message, Composer and Plan Review keep Agent-role rows visible but disabled unless the session is already native-bound. After the active session successfully opens a native Antigravity session, the pickers read its plugin-owned binding and disable other providers while keeping available Antigravity model and effort controls. The DSH global picker lock remains authoritative. Binding reads refresh on mount, input-phase, request-activity or catalog changes, and before selection; failed reads show a localized alert and preserve a known native lock. These reads do not start the native runtime or gate conversation history. Antigravity owns the separate execution-time guard; Model Switch does not create custom Core history events.

The existing 3082 lab replay probe is `node scripts/check-lab-runtime-lock.mjs [native|runtime-absent|plugin-absent]`. It checks the dedicated QA conversation under the already-established condition; it does not disable plugins, select a model, or send a turn. `node scripts/check-lab-native-execution.mjs` verifies the saved guard rejection, restored native continuation, DeepSeek-parent/Antigravity-child completion, and restoration of temporary subagent preferences through public history streams.

## Configure Subagents and capability routes

Open **Settings → Model Switch**. The page hosts six route cards — Subagent, Web search, Image generation, Auto review, Compaction, and Session naming — plus the Provider groups card. Subagents may follow the delegating session's derived route or a fixed provider, model, and effort.

Since 0.4.23 this plugin no longer configures or protects the deployment default ("Main model"). That default is DSH's own: the Host persists the last session switch as the default (including switches made through this plugin's picker or the TUI), exactly like native switching — so a new session starts on whatever was last used. To pin a fixed default, use DSH's own **Settings → Models** page. Official DSH makes ConfigForms memory-only in non-loopback browsers, so the Settings page shows an unavailable message there; open Settings on the Host loopback URL instead. As a side effect of the removal, model switching is never blocked by settings state (previously the picker waited for a writable Main ConfigForm).

Changing the fixed Subagent provider/model replaces the previous model's effort with the target model's default. Models without reasoning support receive no effort.

![Model Switch settings with a fixed Subagent route](docs/screenshots/settings-subagent.png)

Official inherit resolves the active parent request first, then the Host's own session default. A derived or fixed route is injected before the official Subagent descriptor is created, and only when the spawn names no provider, model, or effort — a caller that names a route is never overridden, and a provider whose capability is not `agentOptions` (for example a one-shot process adapter) is never reinterpreted as an Agent-capable route. DSH 0.1.2-alpha.4 carries provider, model, and fixed reasoning effort in that descriptor.

### Saving settings

Every row save is one atomic, revision-fenced mutation through the official ConfigForm `mutate`: a refused write either commits the whole row or nothing, so it can no longer leave a half-written provider/model pair. A draft you edited survives external snapshot updates (another tab's save, the capability poll); a revision conflict is reported with a reload path instead of silently losing either side; and a write that never settles is reported after 30 seconds rather than freezing the page on "Saving…". The ⚠ marker next to a value means exactly one thing: this value is not in the current provider catalog.

## How custom models appear in the Picker

Model Switch does not turn an arbitrary string in its own settings into a model. A provider plugin must publish the model to the official DSH model catalog first:

```text
Provider configuration
→ provider publishes model rows to the DSH catalog
→ the active session Model Directory exposes provider/model metadata
→ Model Switch groups those catalog rows
→ the Picker submits the original provider id and model id
```

The catalog supplies the provider name, model id/name, reasoning efforts, and default effort. A saved route that is no longer present remains visible as unavailable in Settings; the Picker does not pretend it is routable.

### Variant id grammar

Model Switch groups catalog rows by provider and by the model id after peeling these suffixes:

| Catalog model id | Picker variant |
| --- | --- |
| `acme-v1` | Standard row |
| `acme-v1-fast` | Fast |
| `acme-v1-128k` | Context 128K |
| `acme-v1-1m` | Context 1M |
| `acme-v1-1m-fast` | Context 1M + Fast |

Rules:

- `-fast` creates the Fast axis.
- `-<n>k` and `-<n>m` create Context tiers; suffixes may be combined with `-fast` in either order.
- `reasoning.efforts` creates the Effort choices; `reasoning.defaultEffort` selects the initial value.
- Switching Fast, Context, or Thinking variants keeps the current effort only when the target catalog row supports it; otherwise the target row's default effort (or no effort) is used.
- Reasoning metadata marks a catalog row as Thinking-capable.
- Unrecognized ids remain independent model families; Model Switch never drops them.

To support a combined selection, the provider must publish the combined row. Publishing only `acme-v1-fast` and `acme-v1-1m` cannot represent Fast + 1M; publish `acme-v1-1m-fast` as well. The Picker never synthesizes a model id that the provider did not publish.

## Plan Review

Plan Review owns an execution-model draft separate from the session's current route. **Confirm** first commits that model to the active session, then answers the pending Plan review. A refused commit leaves the review pending and retryable. **Reject** and **Discuss in chat** do not execute the Plan.

**Reject** sends the option the asker offered, and any text typed in the card's feedback field as the answer's own `custom` text — plan mode reports that text back to the model as the reason to keep planning, so a rejection can carry what to change. **Discuss in chat** withdraws the takeover so the composer returns and the human speaks in their own words; it uses the Host's `dismiss()` where published and the older generation's `cancel()` otherwise, and names the Host when neither exists. Answering a settled review closes Confirm and Reject, while Discuss and the reload affordance stay reachable so the card always has a way back. Failures keep their wire code (`session/writer-held: …`) visible instead of a bare localized sentence.

**Set as goal and run** arms this Plan as the session's goal and only then answers it, so `dsh-goal-round-driver` keeps the Plan moving after plan mode exits. It calls the released `remote.goals.create`; when a non-complete goal already exists it clears that one first so the new Plan starts with a fresh round cap, and says so in the card. A refusal keeps the review pending with its wire code (`GOAL_AGENT_NOT_LIVE: …`), and a deployment that mounts no goal service disables the button with an explicit reason while the other three actions keep working. The objective is the Plan's full markdown, trimmed — the goal domain imposes no length limit, and the objective rides along as model-visible context every round, so a long Plan costs tokens on each continuation.

The card body shows only the Plan's first-line title and first-paragraph summary; the **full plan** opens automatically in the right sidebar through official ui-plan (the header's "View full plan" reopens it any time). The takeover entry cannot render the official `conversation.plan-review.actions` slot (a child slot allows exactly one declarer), so the card drives ui-plan's registered opener instead — the preview document's address and params stay ui-plan's own construction (see `docs/seam-gap.md`).

![Plan Review with an execution-model picker](docs/screenshots/plan-review.png)

## Auto review model

The official `@deepseek-ai/dsh-experimental-auto-review` (the per-call reviewer for the Auto permission preset) hardwires its review requests onto the session's own route. This plugin takes that row over through a `cordis.patch.yml` row replacement: the official row is disabled and `dsh-model-switch/auto-review` mounts the **same official `apply`** under a scoped child context whose `llm.stream` `provider/model` are rewritten to the reviewer route resolved for that session (provider group → flat card → session model). Session correlation rides a `{ prepend: true }` `tools/pre-execute` listener registered on the review scope immediately after `official.apply(scope)`, binding `exec.agent.session` in an `AsyncLocalStorage` scope around `next()` so parallel sessions on different providers never interfere and mid-session provider switches take effect on the very next review. The "Auto review model" card defaults to off = reviews follow the session model; turning it on pins the catalog head as an editable starting point, and saved changes apply to the very next review. When the optional auto-review bundle never started with the profile the row stays unmounted and the Auto preset keeps its official off state.

Since 0.4.31 the row also owns the seam at runtime, not just in the patch file. The plugin manager writes its component toggles into a layer that applies after every bundle layer, so a manual re-enable of the official「自动审查」component used to bring the official, unguarded gate back — and, because `permissionPresets.registerAuto` is single-registration, two live rows on that seam eventually killed every tool call. The row now takes the seam over the way the session-title slot is taken over: when the official row is about to apply it releases the Auto registration **synchronously first** (so the official row applies cleanly instead of colliding), disables the official row through the public `Entry.update`, and re-claims the registration with a bounded retry — preserving live sessions' Auto selection across the displacement. Toggling the official component back on is therefore a logged, self-healing no-op; the settings card's「自动审查」section says so too.

## Compaction model

Official compaction — `/compact` and DSH's automatic compaction — summarizes history with the conversation's target model by default. The "Compaction model" card (default off) pins that summarization route instead: turning it on pins the catalog head as an editable starting point, and saved changes apply to the very next compaction. Leaving both fields empty returns to the official default. Saving while a compaction is running may interrupt it; it retries next time.

Each summarization call (`options.purpose === 'compaction'`) also resolves its route per session through `compactionScope`: the session's provider group's compaction pair → the flat card pair → the official row's `modelPolicies` / conversation-target default. When a route applies, the child context's `llm` wrapper updates `options.provider` and `options.model` in place before `ctx.llm.stream(options)`, so `summarizeWithLlm` returns and durably records the exact provider/model that wrote the summary in `compaction/summary`. Exact-target `modelPolicies` on the profile's `compaction-basic` row config are still forwarded verbatim:

```yaml
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    modelPolicies:
      - provider: deepseek
        model: deepseek-chat
        summarizationProvider: deepseek
        summarizationModel: deepseek-reasoner
```

How the route reaches the engine depends on where the deployment runs its agent plane. The Web surface moves compaction into each agent preset's isolated `compaction` group, and profile patches cannot address rows inside a preset's `plugins` list — so the Host bridges that nested row at startup (`src/preset-sync.ts`): it disables the group's official `compaction-basic` and inserts `model-switch-compaction` directly after it, which mounts the **same official `BasicCompactionEngine`** under `compactionScope`. Every other preset row is left exactly as the installed DSH (or a deployment's own Web-editor save) wrote it; the plugin ships no preset copies, so a DSH preset change needs no re-sync and a deployment's preset edits are preserved. Surfaces that compose the agent process-wide (the TUI) use the top-level row replacement instead.

Known issue (upstream; recorded in `docs/seam-gap.md`): while the working set stays above the official engine's pressure threshold, automatic compaction can fire on every step and keep re-attempting ranges whose summaries fail the engine's own "summary must be smaller" guard — a visible loop of automatic compactions that this plugin does not control (verified in a session A/B with the plugin enabled and disabled). Mitigations on the forwarded row config: `auto: false` (keeps `/compact`), a higher `thresholdRatio`, a smaller mounted tool schema, or a pinned compaction model whose summaries are leaner.

## Session naming model

DSH names new sessions automatically; the profile's official naming row decides the cadence (right after the first prompt, or on every prompt). The "Session naming model" card picks the model those naming requests use. **Off — both fields empty — is the official behavior: naming follows the session's own model.** On pins a provider/model as an editable starting point.

The route is read through on every naming request: a saved change applies to the very next title with no restart, and a naming request already in flight is never interrupted by a save. Each request resolves its route in order — the session's provider group's naming pair, then the card's flat pair, then the session's own model. The request runs through the official naming implementation, which records the exact provider/model in the session's own `session/title-llm-request` event, so the durable record and the real request always agree. The plugin replaces the official `session-title-llm` row instead of forking the naming logic (the seam allows one registered naming provider per context) and mirrors the cadence that row declared; a profile with no official naming row keeps DSH's deterministic fallback title.

Since 0.4.29 the row also coexists with the experimental "titles that update with the conversation" bundle (`dsh-experimental-session-titles-bundle`, which inserts an all-prompts naming row): enabling that bundle keeps this plugin owning the single naming-provider slot, mirrors the all-prompts cadence so titles refresh with every prompt, and keeps the naming-model and provider-group routes in force (the provider id recorded per title is `session-title-all-prompts-llm`, exactly what the official row would record). Disabling the bundle restores the first-prompt cadence with the same route override. The takeover only uses released loader seams — the `loader/patch-context` waterfall, `Entry.update`, and `sessionTitle.register` plus its disposer — letting the official row register successfully first and then disabling it, so enabling the bundle no longer raises the `already registered` activation-failure toast.

Since 0.4.30 the Auto review row also survives a degraded permission service. DSH's Auto gate reads `permissionPresets.current(session)` before every tool call, and when that service has gone inactive the read throws `cannot get required service "sessionProjections" in inactive context` outside the gate's own reviewer-error handling — so every tool call died before its body ran. The row shadows that service inside its review scope: a failed probe reports "not on Auto", the tool call runs normally, and one log line states that review was skipped. Since 0.4.31 the shadow is **always on** and resolves the service lazily per call (so it protects even while the service is still activating), and its one degradation line carries the exact fiber chain (`uid/state/name/inject` per fiber) that failed resolution — because the upstream cause is a loader lifecycle window: `internal/get` walks the whole caller fiber chain and twenty-four released rows declare `sessionProjections`, so any one of them mid-reload can break an unguarded probe (recorded in `docs/seam-gap.md` with the upstream proposal). The Auto registration itself is brokered — handed over and reclaimed around displacements without unmounting the gate, since unmounting is what flips live `auto` sessions to `danger-full-access` — and a gate re-mounted after a profile reload unloads its previous registration first, so the `auto` preset cannot disappear from the permission picker.


## Provider groups

The "Provider groups" card stores one route group per provider — the compaction, auto-review, session-naming, and subagent routes saved together — and a group saved for provider X applies to the sessions whose own provider is X. Groups are **derived, not written**: switching a session's provider writes nothing, so two sessions on different providers can never overwrite or redirect each other's auxiliary routes.

Every request derives its own route from durable state: the session's provider (its model selection — a just-made pending selection counts — else its latest logged request route), then the group pair for that provider, then the flat deployment-wide pair, then the official default (the conversation target for compaction; the session's own model for auto review and naming; official inherit for subagents, where the fixed card applies only in `fixed` mode). Because nothing is written, this works for sessions this browser never opened and for switches made from the TUI or another client, with no watcher and no residual boundary; a session with no observable provider simply resolves to the deployment default. Mid-session provider switches take effect on the very next compaction, review, title, or subagent call. In the editor, a provider's draft seeds from the currently active routes the first time you configure it, each row's off state means "no pin — fall through to the card, then the official default", and **Delete group** removes the provider's entry entirely (clearing the stored field when the last group goes).

## What Model Switch does not change

- `web_fetch` and its configured provider
- Vision routing, `read_image`, and ordinary chat attachments
- Provider login, credentials, or provider settings cards
- Official Agent Presets
- Existing provider-specific image tools
- The deployment default model (DSH persists the last session switch itself, same as native TUI switching)
- Global compaction policy, naming cadence (only the naming model is configurable), or DSH Core

## Installation

Model Switch ships prebuilt code, so an install needs no build authorization. Install it from the npm registry:

```sh
dsh plugin --profile web add --force dsh-model-switch
```

A packed tarball installs the same build without a registry:

```sh
dsh plugin --profile web add --force ./dsh-model-switch-0.4.26.tgz
```

Then install only the provider adapters you use. This release was checked against official DeepSeek Harness `0.1.7-rc.2` and verified on `0.2.0-rc.2`, `0.2.1-rc.2` and `0.2.1-rc.3` (rc.3 currently ships on the `next` dist-tag):

```sh
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/latest/download/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-codex/releases/latest/download/dsh-llm-codex-0.3.23.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-grok/releases/latest/download/dsh-llm-grok-0.3.19.tgz
```

### Search routing (0.4.7)

Providers declare independent search adapters and model metadata on the existing Host `ModelSwitchAdapterRegistry`. The browser receives only id/name/model metadata over authenticated Connection RPC, not adapters or credentials. Registration/unload updates subscribers; in-place catalog changes are picked up by the bounded 20-second heartbeat. `ProviderDirectory` remains the client role/usage owner, not a second Host execution registry. Published 0.2.8 `sortCatalogGroups` only ranks hardcoded LLM routes; Model Switch ranks live `catalogRoutes` itself so Agent catalog ids follow saved card order when the Owner publishes them. Native `catalogId` / `unknown` account styling still need a newer Owner than published 0.2.8.

DeepSeek uses the official public `DeepSeekSearchProvider`, the existing `web-search-deepseek` settings and credential service. Codex uses its existing ChatGPT credentials; Grok uses its existing subscription token and provider-owned Responses search. Native conversational networking alone does not create a search option. Missing credentials, invalid settings, unsupported models and unavailable adapters fail explicitly, without fallback.

**Registering an adapter does not select the global Web route.** Installation leaves the deployment's existing Web configuration untouched. To opt in, set the existing Web entry's `searchProvider` to `model-switch` while retaining **every other existing config field**, especially `fetchProvider`. DSH id-targeted patches replace the entire config rather than deep-merging it: copy the complete effective config from `dsh --profile web --dump-config`, then change only searchProvider in the deployment/user patch. Do not copy an assumed `fetchProvider: http` over a custom pin.

After opting in, configure the requested search provider/model in Model Switch Settings. No complete supported route means `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` through the official selector; there is no automatic DeepSeek fallback. Without the global pin, the dropdown does not control `web_search`. An unpinned Web service can become ambiguous when multiple search providers are usable. Before uninstalling Model Switch, restore the deployment's prior search pin; otherwise the official selector correctly reports a missing configured provider. The official `web_search` and `web_fetch` tools are never replaced.

Release-aligned search regression: `DSH_RELEASE_ANCHOR=/path/to/official/install/package.json pnpm exec vitest run --config tests/vitest.release.config.ts`. See [search audit and acceptance](docs/search-provider-audit.md) for exact baselines, dependencies and live status.

If `dsh-composer-picker` is installed, remove it from the profile before enabling Model Switch. Model Switch already owns the Composer Picker and Plan Review seat; two owners produce duplicate or competing UI.

Production profiles must use a released registry version or GitHub tag rather than workspace-local dependencies. Restart the selected DSH profile after installation or route changes. **Restart once after installing, updating, enabling or disabling this plugin**: it owns Host rows and takes the official Auto-review row over at runtime (`permissionPresets.registerAuto` is a single registration slot); when a hot enable skips the restart, the official row may still be serving, so the takeover only shields the reviewer path — tools keep running, that call's review is skipped with one log line — and the seam converges on the next start.

## Compatibility

DSH Host peers and development dependencies accept `>=0.1.7-alpha.2`, including rc.1 and later releases. The development lockfile resolves to rc.2. Cordis accepts `>=4.0.4 <5.0.0`.

Verified releases: `0.1.7-alpha.2`, `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.2`. The 0.2.0 claim covers the Host's renamed question verbs, its unawaited `session.selectModel` default write, and its returned `ModelDirectory.select` refusal, each verified in the lab and on a live desktop session.

The verified releases in `package.json#dsh.compatibility.dshReleases` are evidence, not an allowlist. Review public API changes and test new Host releases before adding a verification claim.

**Third-party auto modes.** When [`@log.li/dsh-automode`](https://github.com/log-li/dsh-automode) is installed, the `model-switch-automode-compat` row injects this plugin's Auto-review route and pure-read list into that row's **in-memory** config — no profile write, nothing to configure by hand. Its `auto-mode` preset then reviews with your configured route and passes your allowlisted tools, while the `auto` preset keeps using this plugin's own gate. Explicit `classifier.provider/model` values in that row always win, pattern-shaped allowlist entries cannot transfer (its check is exact-match), and its hard-deny bands still run first.

## Development

Requires Node 22.19+ and pnpm.

```sh
pnpm install
pnpm run check
```

`check` builds Host and Client artifacts, runs unit and Cordis/Settings composition tests, validates the extracted package, and verifies reproducible bundles. Product scope is defined in [PRODUCT.md](PRODUCT.md); implementation constraints live in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Release installation (Latest)

Explicit model routing for Main, Subagent, Composer, Plan Review, and capability tools, checked on official DeepSeek Harness `0.1.7-rc.2` and `0.2.0-rc.2`. The release artifact contains built Host/Client files, not sibling source or local paths.

Latest installation (the asset filename must match the current latest release):

~~~sh
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/latest/download/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-model-switch/releases/latest/download/dsh-model-switch-0.4.16.tgz
~~~

Fixed-version installation:

~~~sh
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/download/v0.2.14/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-model-switch/releases/download/v0.4.16/dsh-model-switch-0.4.16.tgz
~~~

Update, uninstall, and verify:

~~~sh
# Update to the latest Release
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/latest/download/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-model-switch/releases/latest/download/dsh-model-switch-0.4.16.tgz
# Verify the loaded version
dsh plugin --profile web list
# Uninstall only this plugin
dsh plugin --profile web remove dsh-model-switch
~~~

Configuration: use the plugin section in Settings for Web UI plugins, or the profile dsh.profile.bundles entry for Host-only plugins. Start with this README's minimal YAML/JSON example and provide credentials/backend addresses explicitly.

Rollback: reinstall the immutable v0.4.15 archive and restore the recorded profile; no Host downgrade is required. Inspect journalctl --user -u dsh-web.service; never link a checkout into production.

Release and integrity: [v0.4.16](https://github.com/NOirBRight/dsh-model-switch/releases/tag/v0.4.16) · [SHA256](https://github.com/NOirBRight/dsh-model-switch/releases/download/v0.4.16/dsh-model-switch-0.4.16.tgz.sha256).
