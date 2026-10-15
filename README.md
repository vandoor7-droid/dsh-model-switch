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

## Send-time context protection

When a sent message will use a different model or context-tier id than the last request, Model Switch checks the full pending request against the target window before that request is sent. Choosing a model in the picker does not compact. If the target is over budget, history is compacted once with the previous model through a private compaction engine; DSH's own automatic compaction settings are not changed. Progress appears as plugin notices in the transcript. The budget includes the completion notice and pending model-change notice; an oversized summary blocks the request. Failure keeps the user message in the session and does not send the target request or emit a switch-success notice. Turn the behavior off with **Settings → Model Switch → Check and compact context on send** (on by default). Native External Agent runtimes are not treated as DSH-compactable history.

## Auto review model

The official `@deepseek-ai/dsh-experimental-auto-review` (the per-call reviewer for the Auto permission preset) hardwires its review requests onto the session's own route. This plugin takes that row over through a `cordis.patch.yml` row replacement: the official row is disabled and `dsh-model-switch/auto-review` mounts the **same official `apply`** under a scoped child context whose `llm.stream` `provider/model` are rewritten to the reviewer model pinned in Settings. The "Auto review model" card defaults to off = reviews follow the session model; turning it on pins the catalog head as an editable starting point, and saved changes apply to the very next review. When the optional auto-review bundle never started with the profile the row stays unmounted and the Auto preset keeps its official off state; an official row already active elsewhere is reported explicitly instead of producing a second `registerAuto`. The reviewer route is deliberately deployment-wide: the official gate builds its review request with no session identity and closes over the one context it was applied with, so no public seam can attribute a review to a session — the per-session route it would need is recorded in `docs/seam-gap.md`.

## Compaction model

Official compaction — `/compact` and DSH's automatic compaction — summarizes history with the conversation's target model by default. The "Compaction model" card (default off) pins that summarization route instead: turning it on pins the catalog head as an editable starting point, and saved changes apply to the very next compaction. Leaving both fields empty returns to the official default. Saving while a compaction is running may interrupt it; it retries next time.

The pair stays deployment-wide by design: the official compaction transaction durably records the provider/model that wrote the summary, so rewriting the summarization call per session would make that record false. For route-scoped summarization the supported alternative is the official exact-target `modelPolicies` array on the profile's `compaction-basic` row config: each entry matches one exact routed conversation target and overrides its compaction policy — including the summarization pair — for that target, and this plugin forwards the row's own config verbatim (the card's pair is overlaid only when both fields are set):

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

How the route reaches the engine depends on where the deployment runs its agent plane. The Web surface moves compaction into each agent preset's isolated `compaction` group, and profile patches cannot address rows inside a preset's `plugins` list — so this plugin replaces each shipped preset row wholesale (the same id-targeted mechanism the Web preset editor saves with) and swaps that group's official `compaction-basic` for `model-switch-compaction`, which mounts the **same official `BasicCompactionEngine`** with only `summarizationProvider`/`summarizationModel` overlaid (either field alone is ignored). Surfaces that compose the agent process-wide (the TUI) use the top-level row replacement instead. Two consequences: a DSH release that edits those presets needs the copies re-synced (this plugin's per-release verification covers it), and a deployment that edits presets in the Web editor writes its own wholesale row that then owns the merge.

Known issue (upstream; recorded in `docs/seam-gap.md`): while the working set stays above the official engine's pressure threshold, automatic compaction can fire on every step and keep re-attempting ranges whose summaries fail the engine's own "summary must be smaller" guard — a visible loop of automatic compactions that this plugin does not control (verified in a session A/B with the plugin enabled and disabled). Mitigations on the forwarded row config: `auto: false` (keeps `/compact`), a higher `thresholdRatio`, a smaller mounted tool schema, or a pinned compaction model whose summaries are leaner.

## Session naming model

DSH names new sessions automatically; the profile's official naming row decides the cadence (right after the first prompt, or on every prompt). The "Session naming model" card picks the model those naming requests use. **Off — both fields empty — is the official behavior: naming follows the session's own model.** On pins a provider/model as an editable starting point.

The route is read through on every naming request: a saved change applies to the very next title with no restart, and a naming request already in flight is never interrupted by a save. Each request resolves its route in order — the session's provider group's naming pair, then the card's flat pair, then the session's own model. The request runs through the official naming implementation, which records the exact provider/model in the session's own `session/title-llm-request` event, so the durable record and the real request always agree. The plugin replaces the official `session-title-llm` row instead of forking the naming logic (the seam allows one registered naming provider per context) and mirrors the cadence that row declared; a profile with no official naming row keeps DSH's deterministic fallback title.

## Provider groups

The "Provider groups" card stores one route group per provider — the session-naming and subagent routes saved together — and a group saved for provider X applies to the sessions whose own provider is X. Groups are **derived, not written**: switching a session's provider writes nothing, so two sessions on different providers can no longer overwrite or redirect each other's auxiliary routes (before 0.4.24 a switch *wrote* the group into the shared fields, and one session's switch could steer another session's naming and subagent requests).

Every request derives its own route from durable state: the session's provider (its model selection — a just-made pending selection counts — else its latest logged request route), then the group pair for that provider, then the flat deployment-wide pair, then the official default (the session's own model for naming; official inherit for subagents, where the fixed card applies only in `fixed` mode). Because nothing is written, this works for sessions this browser never opened and for switches made from the TUI or another client, with no watcher and no residual boundary; a session with no observable provider simply resolves to the deployment default. A switch to a provider without a group changes nothing, and a switch within one provider re-resolves to the same routes.

The group editor therefore covers exactly these two routes: auto review and compaction stay deployment-wide cards (see the two sections above for why), and search and image routes are out of scope. The stored configuration format is unchanged — an older group entry that still carries compaction or auto-review fields is accepted as-is and those fields are ignored, so no migration runs. In the editor, a provider's draft seeds from the currently derived routes the first time you configure it, each row's off state means "no pin — fall through to the card, then the official default", and **Delete group** removes the provider's entry entirely (clearing the stored field when the last group goes).

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
dsh plugin --profile web add --force ./dsh-model-switch-0.4.17.tgz
```

Then install only the provider adapters you use. This release was checked against official DeepSeek Harness `0.1.7-rc.2` and verified on `0.2.0-rc.2`:

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

Production profiles must use a released registry version or GitHub tag rather than workspace-local dependencies. Restart the selected DSH profile after installation or route changes.

## Compatibility

DSH Host peers and development dependencies accept `>=0.1.7-alpha.2`, including rc.1 and later releases. The development lockfile resolves to rc.2. Cordis accepts `>=4.0.4 <5.0.0`.

Verified releases: `0.1.7-alpha.2`, `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.2`. The 0.2.0 claim covers the Host's renamed question verbs, its unawaited `session.selectModel` default write, and its returned `ModelDirectory.select` refusal, each verified in the lab and on a live desktop session.

The verified releases in `package.json#dsh.compatibility.dshReleases` are evidence, not an allowlist. Review public API changes and test new Host releases before adding a verification claim.

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
