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

## 2026-10-30 rc.5 UI pass (virtual, Headless Edge over CDP)

The host ran the rc.5 lab (`DSH_HOME=D:\dsh-lab`, port 3082) with our 0.4.54 and every provider
pointed at `tools/route-probe.mjs` (zero real quota). The page was driven by a small CDP client
(`D:\tmp\cdp.mjs`): headless Edge, no window, no focus change — the bundled browser lane still
fails with `BROWSER_LANE_UNAVAILABLE: Edge exited during startup (0)` even after clearing 24
stray agent-profile processes, while an equivalent headless launch answers CDP on port 9333.

| item | result |
| --- | --- |
| Settings page renders | **yes** — 设置 → 通用设置, with the 模型切换 section |
| Model picker switches | **yes** — `gpt-6.1-sol · Default` ↔ `MiMo-V2.6-Flash · Default` |
| Memory card | **yes** — 「记忆蒸馏模型 · apigoto · probe-memory」 with the new fallback wording |
| Exemption card | **yes** — 「已开启 · 名单内 58 条免审查」; the `tools` RPC reports `recommended: 58` |
| automode row seen by the adapter | **yes** — `automode: {installed: true, route: "apigoto/mimo-v2.6-flash", added: 53, skipped: 2}` |
| `read` needs no review | **yes** — the recorder shows only `gpt-6.1-sol` rows (tool=read, then the answer) |
| skip counter increments | **no** — `skippedReadOnly` stayed 0 after the read, so the call was cleared by the host/official reviewer path rather than by our allowlist counter |
| `write` still reviewed | **not exercised** — a write inside the workspace needs no approval under 「请求批准」, so no reviewer call happens at all; the review path needs an action that asks for approval (outside the workspace) or an auto-review mode |
| plan card 「去聊天里说」 | **not exercised** |

So rc.5 stays **unverified for declaration**: the settings surface, the model picker, both cards
and the automode wiring all work, but the two remaining items need an approval-requiring action
and a plan-mode card. Screenshots: `D:\dsh-artifacts\ui-01-home.png` … `ui-05-picker.png`.

### Follow-up (same day): the reviewed write path, and two anomalies

Enabling the **自动审查** preset (the picker asks for an explicit risk confirmation) makes the
review path visible. With the recorder replaying one `write` call:

```
12:52:08 gpt-6.1-sol      tool=write      ← the agent asks for the write
12:52:08 mimo-v2.6-flash  tool=-          ← the reviewer, using OUR configured route
12:52:08 gpt-6.1-sol      tool=-          ← the answer
```

So a write **is** reviewed on rc.5 and the reviewer is the route this plugin configures
(`autoReviewProvider/Model`). Two anomalies stay on the record:

- The plugin's own counters do **not** move: `allowedCalls: 0` and `skippedReadOnly: 0` after
  both a reviewed write and a skipped read, so on rc.5 the decision is taken by the host path
  while our route is honoured — the counter is a display-only mismatch, not a route failure.
- A plain read is cleared without any reviewer call even in 自动审查 mode, which matches the
  纯读免审查 policy but again bypasses our counter.
- The plan card could not be reproduced: this profile's UI offers no plan-mode entry (the
  composer exposes 只读/请求批准/完全放开/Auto mode/自动审查/EXP only), and replaying a plan-shaped
  answer renders it as ordinary prose ("虚拟计划 · 检查输入 · 执行变更 · 复核结果"), so the
  「去聊天里说」 exit was never on screen.

### Plan card attempt (2026-10-30): the tool is there, the approval UI is not reachable in this lab

Replaying an `exit_plan_mode` call (the rc.5 tool name, args `{plan}`) renders a **plan
artifact card** — 「三步计划 · 计划 · Markdown · 打开」 — so the tool and its client renderer both
work. The **approval** card that carries our 「去聊天里说」 exit did not appear, and neither did
确认执行 / 拒绝 / 查看完整计划.

Tried, in order:

1. mount `@deepseek-ai/dsh-plan-mode` as a plain row → plan artifact only;
2. wrap it in a `cordis:group` with `isolate: { planMode: true }` → same.

Reason: the approval surface is driven by an **agent preset** that carries `planMode: true`
(the desktop profile defines one — a ~200-line preset block, `isolate: { planMode: true }` plus
the plan-mode row with its long system section). The lab profile has no such preset, so sessions
never enter plan mode and the host only files the plan as a document. The lab patch was restored
from backup after the attempt; nothing in the desktop profile was touched.

So the last rc.5 interface item needs either a copy of that preset block into the lab profile or a
decision to accept it as a documented gap.

#### Second attempt: a minimal plan preset is not enough

The next try built a lab-only agent preset (`@deepseek-ai/dsh-agent-preset`, id `plan`, one
`planning` group with `isolate: { planMode: true }` around `@deepseek-ai/dsh-plan-mode`):

| variant | result |
| --- | --- |
| plan-mode row at top level | plan artifact card only |
| row inside `cordis:group` + `isolate.planMode` | plan artifact card only |
| minimal preset → 「计划模式（lab）」 in the mode menu, session really runs it | still the artifact card (「三步计划 · 计划 · Markdown · 打开」), no 确认执行 / 拒绝 / 去聊天里说 |
| same preset plus `@deepseek-ai/dsh-user-questions` | the preset no longer appears in the mode menu at all |

Two things follow. First, the approval surface needs the **full preset composition** — the
desktop's working preset is a ~200-line copy of the standard plugin list
(`preset-YiXuan`, marked "复制自 standard") rather than a two-row stub; a stub gives the session
plan-mode and the tool but nothing that can present an approval. Second, rc.5's plan approval
speaks through `userQuestions` (`dsh-plan-mode` references it, and the rc.5 static diff added
`PendingUserQuestion` / `state: open|continued`), so the 「去聊天里说」 exit this plugin added in
v0.4.47 may need re-wiring to that surface rather than the older plan card.

The lab patch was restored from backup; nothing in the desktop profile was touched.

#### Third attempt: mounting the approval service does not enter plan mode either

Reading the tool explains the earlier results: `exit_plan_mode` first checks
`loggedActive(agent.session)` and only then `ctx.get('userQuestions')`, throwing
"only available in plan mode" or "no user-questions channel is available to review the plan"
before it can raise the review question. So the artifact card is the **error path**, not a
different approval surface.

Mounting both parts at profile level (`@deepseek-ai/dsh-user-questions` plus a
`cordis:group` with `isolate: { planMode: true }` around `@deepseek-ai/dsh-plan-mode`) still
renders the artifact card, i.e. the session never becomes "active" for plan mode. `planMode`
appears nowhere outside the plan-mode plugin itself, so it is a preset-scoped isolate that a
top-level row cannot reproduce.

Conclusion: verifying 「去聊天里说」 on rc.5 needs a preset that carries the **full standard
composition** plus the planning group. The lab patch has been restored; the cheapest check left
is the desktop profile, whose `preset-YiXuan` already has that composition and where plan mode
is known to work.
