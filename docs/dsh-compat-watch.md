# DSH compatibility watch (automation state)

Automated daily check. When the `latest` dist-tag of `@deepseek-ai/dsh` moves,
update this plugin for the new line **without dropping older lines**.

## Baseline

| Field | Value |
|---|---|
| Last check | 2026-10-24 (Asia/Shanghai) |
| `@deepseek-ai/dsh` dist-tags | `latest` = `0.2.1-rc.2`, `next` = `0.2.1-rc.3`, `alpha` = `0.2.1-alpha.5` |
| Last verified line | `0.2.1-rc.3` |
| Plugin version at that check | 0.4.41 |

`latest` moving is the trigger. `next`/`alpha` are early signal only — record
them, do not update the plugin for them unless the same API change is already on
`latest`.

Exception on record: the `0.2.1-rc.3` line was verified at the user's explicit
request while it still sat on `next`. It followed the same evidence bar as a
`latest` move (contract diff + real-host lab run + rc.2 regression), so the line
is listed as verified even though `latest` still points at `0.2.1-rc.2`.

## rc.3 change surface (2026-10-24)

Compared `dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3` (300 files). Everything this plugin
imports stayed additive:

| Area | rc.2 → rc.3 | Impact |
|---|---|---|
| `client/ui-conversation` | adds `conversation.session.header.views.actions` and header `entryPins`/`entryActions`/`setPinned`; `conversation.composer` chain and `ComposerChainProps` unchanged | none |
| `client/ui-conversation` input | `DraftInitializationOptions` gains `whenDraftExists`; `requestDraftInitialization` treats `clearPreviousDraft` as `replace` (compatible) | none (this plugin never calls it) |
| `client/ui-user-questions` | version + comment only | none |
| `client/ui-primitives` | adds `IconAppsAddOutline*` | none |
| `experimental-auto-review`, `core/tools`, `core/session`, `api/*` | version bumps only | none |
| new "More" menus (sidebar / conversation / right sidebar) | new slots, additive | settings section and cards still render (lab checked) |

Lab evidence (2026-10-24): rc.3 host `3083` (`@deepseek-ai/dsh@0.2.1-rc.3`,
separate `~/.dsh-lab3` home) with the shipped 0.4.41 artifact — mounts without an
unverified-runtime warning, 58-entry default allowlist renders and restores, the
skip counter reaches 3 on `read`/`glob` under the auto preset while a `write`
leaves it at 3, the plan card's "discuss" ends the turn as `aborted` while its
"confirm" path runs the approved plan to `completed` (the written file held the
planned content), the model picker lists all 15 configured models and selecting
`deepseek-flash` (apigoto) records `model/selection` and answers as that model,
and a draft survives a session switch. Same artifact on rc.2 host `3082`: skip
counter 2 on `glob`/`read`, discuss ends as `aborted`, and the same
`deepseek-flash` switch lands (15 models listed, `model/selection` written, reply
from that model) — card and picker behaviour is identical across the two lines.

## Third-party auto-mode coexistence (v0.4.42)

`@log.li/dsh-automode` (0.17.0) has no public seam for an outside route or tool
list: its classifier route and its pure-read allowance are read from its own row
config (`resolveRoute(agent, config.classifier.provider, config.classifier.model)`
in `src/classifier.ts`, `config.readOnlyTools.includes(name)` in
`src/pre-execute.ts`). The `model-switch-automode-compat` row therefore rewrites
that row's **live** `entry.options.config` from the `loader/patch-context`
waterfall, before the loader mounts it:

- `classifier.provider/model` ← this plugin's Auto-review route, only while the
  row leaves both empty (either half set counts as user intent);
- `readOnlyTools` ← union of the row's list and this plugin's allowlist, only
  while the pure-read switch is on. Pattern entries (`sessions_list__*`) cannot
  transfer because the third-party check is exact-match; they are reported.
- Nothing is persisted: `Entry.update()` is never called, so the profile stays
  byte-identical across boots and the in-memory view is re-applied on every
  start.

The two mechanisms stay independent by preset: `auto` sessions run this plugin's
gate, `auto-mode` sessions run the third-party gate. Our shadow of
`permissionPresets.current()` returns the real value for `auto-mode`, and our
adaptation does not touch the third-party deny band, so its hard floor survives.

## Previously verified lines (must keep working)

`0.1.7-alpha.2`, `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.2`, `0.2.1-rc.2`,
`0.2.1-rc.3`

Compatibility means **additive** adapters: every runtime seam this plugin reads
keeps a branch for each released shape it has been verified against (for example
`executeSessionTitleLlm` **and** `generateSessionTitleWithLlm`,
`startActivation` **and** `start()`/`startContinuable()`), selected at install
time from the resolved row, never by hard-coding one line.

## Procedure when `latest` moves (do all of it)

1. `npm view @deepseek-ai/dsh dist-tags --json` — confirm the new `latest`.
2. Read the new line's public API changes against what this plugin calls (see
   `dsh-dev-reference` skill; official packages in the lab profile are readable,
   or pull the matching tag to `%TEMP%`).
3. Update only this repo. Never patch DSH. Keep peer/dev ranges as unbounded
   lower bounds (`>=<lowest verified>`), never an upper bound or an exact pin.
4. Add the new line's adapters **beside** the existing ones (old lines stay
   green); run `pnpm run check`.
5. Install the built artifact into the lab profile
   (`DSH_HOME=D:\dsh-lab`, port 3082), boot it, and drive one real tool call
   (CDP: Edge with `--remote-debugging-port`, submit via the「发送消息」button).
6. Record the verified line here, add a `CHANGELOG.md` entry, and follow
   `AGENTS.md`: functional change → tag `vX.Y.Z` and publish; docs-only → push
   only.

## Failure handling

- Fetch failure → follow the global search fallback rule, then read the installed
  official package instead; do not update versions without evidence.
- A missing public seam → keep that capability disabled with an explicit error
  and record it in `docs/seam-gap.md` rather than patching DSH.
- Lab verification fails → do **not** publish; report the failing line.

## 2026-10-30 check: DSH 0.2.1-rc.5 (latest), automode 0.17.0 (unchanged)

`latest` moved rc.3 → **0.2.1-rc.5** (released 2026-10-30T02:12Z; rc.4 = ACP stdout fix,
rc.5 = thinking-content display). automode `latest` stayed at 0.17.0, so its section is
unchanged. Everything below is **virtual / 零真实额度**: the lab profile's providers all
point at `tools/route-probe.mjs` (`http://127.0.0.1:4719/v1`, `PROBE_API_KEY=sk-probe-virtual-0`);
recorder log `D:\dsh-artifacts\probe-rc5.jsonl`, host log `D:\dsh-artifacts\host-rc5.log`.

### A. 静态面（API 差异审查）

Compared the packages our code actually imports, baseline (0.1.7-rc.2 / cordis 4.0.4,
the versions this plugin compiles against) vs the rc.5 tree:

| package | baseline | rc.5 | declaration diff |
| --- | --- | --- | --- |
| cordis | 4.0.4 | 4.0.5 | identical (`lib/types/fiber.d.ts` byte-identical, `Fiber.update` unchanged) |
| cordis-plugin-loader | 1.0.5 | 1.0.6 | 1 file: additive `entry.moduleNamespace` |
| dsh-permission-presets | 0.1.7-rc.2 | 0.2.1-rc.5 | typert remote typing refactor only; host `current()` unchanged |
| dsh-plan-mode | 0.1.7-rc.2 | 0.2.1-rc.5 | doc-comment change only |
| dsh-llm | 0.1.7-rc.2 | 0.2.1-rc.5 | additive: `LlmCallControls`, `ConfigureCall`, image refs, `defaultBaseURL`; `stream()` unchanged |
| dsh-tools | 0.1.7-rc.2 | 0.2.1-rc.5 | comments + additive params on `createRunCodeTool`/`renderToolsSdk` (we call neither) |
| dsh-user-questions | 0.1.7-rc.2 | 0.2.1-rc.5 | **new** `PendingUserQuestion` + `state: 'open' \| 'continued'` |
| dsh-settings / dsh-agent-default-model | 0.1.7-rc.2 | 0.2.1-rc.5 | identical |
| dsh-web / dsh-session / dsh-credentials / dsh-agent / dsh-typert-protocol | 0.1.7-rc.2 | 0.2.1-rc.5 | field/comment additions, no removed member we import |

No changed symbol is referenced by this plugin (`TypertRemoteContribution`,
`createRunCodeTool`, `renderToolsSdk`, `moduleNamespace`, `LlmCallControls`,
`ConfigureCall` → 0 references in `src/`).
Note: `dsh-client-ui-slots` / `-primitives` are absent from the rc.5 install tree, but they
were absent in rc.3 too (never CLI dependencies); the client import map still resolves them,
so this is not an rc.5 regression.

（静态只是"代码如此"，不构成兼容声明。）

### B. 运行时（lab `D:\dsh-lab`, port 3082, DSH 0.2.1-rc.5, plugin 0.4.53 from a local pack）

Booted `node <lab>/cli/node_modules/@deepseek-ai/dsh/lib/bin.js --profile lab --port 3082
--no-open`. Observed:

- **No `best-effort on unverified runtime` warning** and no `blocked on DSH` line — the
  `>=0.2.0-rc.2` floor classifies rc.5 as verified (the two activation warnings in the log
  are unrelated profile rows: `dsh-experimental-session-search` and `@log.li/dsh-automode`
  are not installed in this lab).
- `/api/plugin-rpc/model-switch` answers **200** for the `capabilities` endpoint:
  `mainDefaults`, `settings`, `centralSubagentRouting`, `searchProviderAdapters`,
  `imageProviderAdapters`, `autoReview` = available; `packagedPresetRoots`,
  `toolOwnerSuppression`, `visionProviderAdapters` = unavailable with explicit reasons
  (same optional seams, not used by the checklist).
- `tools` endpoint: **recommended read-only list = 58 entries** (the exemption default
  matches).
- The web page's module list includes `dsh-model-switch/client.js`, and that bundle is
  served (2 310 887 bytes) containing the plugin's UI strings (`Model Switch` ×6,
  `审查豁免` ×1, `autoReview` ×104).

### C. 未验证（因此本次不宣称 rc.5 已验收）

The UI-interaction half of the checklist could not run: this session's browser lane is
unavailable (`BROWSER_LANE_UNAVAILABLE: Microsoft Edge exited during startup (0)`, three
attempts; `bcdp_*` tools are not present in this session). Untested therefore:
settings-page rendering, `read`/`glob` incrementing the skip counter, `write` still being
reviewed, model picker switching a session, and the plan card's "去聊天里说" ending aborted.
No version was tagged for this check; the evidence above is recorded so a UI-capable session
can finish the list without redoing A/B.
