# Route verification matrix

How each capability route in Model Switch was actually verified, on which plane, and
what is still unmeasured. A route counts as verified only when a real call reached a
recorder or a log line whose model name changed with the route — a green unit test,
a saved setting, or a value read back from the settings document does **not** count.

- Plugin: `dsh-model-switch@0.4.46`
- DSH: `0.2.1-rc.3`
- Plane: `DSH_HOME=%USERPROFILE%\.dsh-lab`, port 3082
- Recorder: `tools/route-probe.mjs` (local OpenAI-compatible endpoint that records
  `model`, `stream`, and timestamp per request). `apigoto`'s `baseURL` was pointed at
  the recorder; the main model stayed on the official `deepseek-account`, so any
  request the recorder saw had to come from a non-main route.

| Route | Verified | Evidence |
| --- | --- | --- |
| Main model | yes | Recorder rows `deepseek-flash`; reply content matches |
| Session naming | yes | One `mimo-v2.6-flash` request at session start |
| Subagent | yes | `mimo-v2.6-flash` requests during the subagent run, while the main model was official |
| Compaction | yes | `/compact` reported "已压缩 5 条历史记录（约 1788 tokens）"; recorder rows at the same second |
| Memory distillation | yes | `memory.log`: L1 extraction, L2 integration and L3 profile all ran on `apigoto/mimo-v2.6-flash` and returned real output. See `prime-memory.md` |
| Auto review | **no** | The optional bundle is shipped with DSH (`@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.3` is already in the runtime): adding it to `dsh.profile.bundles` makes the preset appear in the access-mode menu (`自动审查 EXP`). But the host's `permissionPresets/catalog` RPC still returns only four presets — no `auto` — while the plugin reports `held: true`, and selecting that menu entry sends no session-settings call at all. Root cause open; see the note below |
| automode | **no** | `@log.li/dsh-automode` installs into the lab profile without a compatibility rejection, and its `Auto mode` preset does switch and run. The adapter reported `routeSkipped: 'no-route'` because it reads this plugin's **flat** `autoReviewProvider/Model` pair and the lab only pinned the provider group — so the classifier never received a route and the recorder stayed empty |

## Notes on the two unmeasured rows

Both are open questions, not observed failures of the router itself.

- **Auto review.** Enabling the bundle is necessary but not sufficient here: the menu
  lists `自动审查 EXP` while the server catalog omits `auto`, and clicking the entry has
  no effect (the page issues no preset-switch request). Our takeover reports `held: true`,
  so the gate did claim the registration in its own context; the catalog appears to be
  served from a different `permission-presets` instance. Until that is settled, the
  reviewer route stays "unverified" here even though its rewrite path is covered by unit
  tests (`tests/auto-review.spec.ts`).
- **automode.** The next run must set the flat `autoReviewProvider`/`autoReviewModel`
  (not only the provider group) so `routeOf()` hands the classifier a route, then trigger
  an escalating action while the `Auto mode` preset is selected and confirm the recorder
  sees the reviewer-unique model.

A related defect this measurement surfaced: the plugin could not boot the **headless**
profile at all — the review-timeout row awaited a settings write during activation and
deadlocked the loader (`unsettled top-level await`, CLI exit 13). Fixed in v0.4.47 by
firing the write without awaiting it.

## UI layout checks

The plan review card's narrow-window rules live in
`src/client/picker/PlanReviewCard.module.css` and were reviewed line by line: the action
row wraps instead of clipping, the primary `确认执行` button is `flex-shrink: 0` on wide
cards and `flex: 1 1 0` with `overflow-wrap: anywhere` under the 720 px breakpoint, the
header picker takes its own row, and the strip wraps.

**No screenshot exists for it.** Producing one needs a plan proposal in the UI, and this
lab profile has no plan tooling configured (`cordis.patch.yml` contains no plan row —
the only `plan` hits are an API-key env name), so the agent answers with prose instead of
opening the card. Two further constraints found while trying: `Browser.setWindowBounds`
is rejected by this browser runtime ("No web contents in the target"), and a full-page
screenshot ignores `Emulation.setDeviceMetricsOverride`, so the check has to use an
element-level screenshot of the card. Until a profile with plan tooling is used, the
narrow-window layout is code-reviewed only, not visually verified.

## Attribution gotcha

The memory plugin posts a distillation call after every turn. With its route pointed at
the recorder those calls appear as periodic `stream: true` rows and can be mistaken for
another route's traffic. Confirm a row's owner from `memory.log` (which prints the model
per call) before attributing it. Review calls are also streaming (`llm.stream()`), so
"non-streaming means review" is a wrong discriminator; use a distinct model name for the
route under test instead.

## automode route

`@log.li/dsh-automode` is not part of the provider groups: `src/provider-group.ts` has no automode key. `src/automode-compat.ts` fills the row's `classifier.provider` / `classifier.model` from this plugin's **Auto-review** route, and only when the row leaves them empty (an explicit pair is kept, reported as `routeSkipped: 'user-set'`). So the automode classifier inherits the auto-review route and can be measured without the official auto-review gate being installed — point `autoReviewProvider/Model` at the recorder with a unique model name and trigger one automation. Not yet run: the lab installation of `@log.li/dsh-automode@0.17.0` succeeded, but the profile has no automode row yet, so the plugin is not loaded.



## Virtual two-way replay (2026-10-28, 0.4.47 lab attempt)

- **Probe capability**: `tools/route-probe.mjs` now takes `--map` so one probe answers
  several measured models at once (`{"gpt-6.1-sol":{"tool":"exit_plan_mode","once":true,"args":{…}},"probe-review":{"preset":"classifier-allow"}}`).
  `once: true` replays the tool call on the first request for that model only — a
  tool call on every request makes the agent retry it until stopped by hand (observed:
  539 steps in one turn).
- **Lab virtualization**: the rc.3 lab profile (`~/.dsh-lab3`) points its `apigoto`
  provider at `http://127.0.0.1:4719/v1` with `PROBE_API_KEY=sk-probe-virtual-0`;
  `.scratch/start-lab3.sh` no longer imports desktop credentials, and a `plan-mode`
  row was added so the exit tool exists. Recorded requests, no real API: zero quota.
- **What it proved**: `model=gpt-6.1-sol` received the replayed `exit_plan_mode` call
  and the next request came back as text, i.e. the tool executed — but the Plan
  review card never rendered because the pending question was settled automatically
  in this profile (no answerer). So the card, its 720 px layout, and the new
  "keep also commits the picked model" behaviour stay **unverified at runtime** here;
  they are covered only by `tests/picker/plan-review-card.spec.tsx` (32 cases).
- **Not run this round**: the Auto review and automode-classifier rows above. Next
  attempt needs a profile where the plan question is not auto-cancelled (desktop-shaped
  client set, or a registered answerer in the lab).

### automode classifier: 2026-10-28 attempt (still unmeasured)

Re-ran the virtual automode measurement on the rc.3 lab: session preset `Auto mode`,
main model on the probe (`gpt-6.1-sol` → replayed `bash` call, one-shot), classifier
model mapped to `classifier-allow` (`mimo-v2.6-flash`). The probe recorded only two
requests — the replayed `bash` call and the follow-up text — and the automode audit log
gained no per-call rows (`~/.dsh/auto-mode/decisions.jsonl`: boot lines only).

So the gate allowed the call **before** classification, exactly as it did on 2026-10-24,
and no classifier request was ever issued. What *is* established:

- the adapter's injected route reaches the row (`model-switch: adapted dsh-automode
  (route apigoto/mimo-v2.6-flash, …)` plus the gate's own config dump from the
  2026-10-24 probe run), and
- the gate's audit/boot line proves the plugin is active in an `auto-mode` session.

What is **not** established: a real classifier request carrying our route. Forcing it
needs a call the gate treats as an escalation (a write outside the workspace, a denied
band, or an unknown tool) — not a plain `bash` command, which its allow path settles
silently. Row stays "no" until such a call is captured.

## Review timeout

`model-switch-review-timeout` writes the configured value into the reviewer
providers' `streamIdleTimeoutMs` in the profile document. Upstream reads that key
only from the pi-ai provider profile (no per-request override; `@deepseek-ai/dsh-timeout`
rejects 0, negatives and Infinity), so the legal range is (0, 2147483647] ms,
"cancel" is written as the ceiling, the key belongs to the provider (it covers
every call through it), and the write is read at the **next** start.

Measured in the lab (DSH 0.2.1-rc.3, virtual / zero real quota: the chat model is
hung 8 s before replying). Reproduce with
`node tools/route-probe.mjs --preset ok --hang 8000`.

| Setting | Key written | Same start | Next start |
| --- | --- | --- | --- |
| 5 s | `streamIdleTimeoutMs: 5000` | completes (300 s still in force) | `TIMEOUT: pi-ai stream idle timeout after 5000ms` |
| cancel | `streamIdleTimeoutMs: 2147483647` | — | completes after the 8 s hang |
| reset | key removed | — | completes (upstream default) |

Two defects this measurement surfaced, both fixed in v0.4.50: awaiting the
settings write during row activation deadlocked the loader (the headless profile
could not boot — CLI exit 13 with an unsettled top-level await), and clearing the
field with `set null` was refused by the host schema instead of unsetting it.

## Update (2026-10-28): auto-review and automode

- Enabling `@deepseek-ai/dsh-experimental-auto-review` is done by listing it in the
  profile's `dsh.profile.bundles` (already shipped in the runtime at 0.2.1-rc.3);
  the access-mode menu then shows `自动审查 EXP`. **But** the host's
  `permissionPresets/catalog` RPC still returns only four presets (no `auto`) while
  the plugin reports `held: true`, and clicking the entry issues no preset-switch
  request. Root cause open (the catalog appears to be served from a different
  permission-presets instance than the one the takeover claimed).
- automode: the row installs without a compatibility rejection and its `Auto mode`
  preset switches and runs, but the adapter reported `routeSkipped: 'no-route'` —
  it reads this plugin's **flat** `autoReviewProvider/Model` pair, and the lab only
  pinned the provider group. The next run must set the flat pair before measuring
  the classifier call.

### automode: why it is still unmeasured

The lab is fully prepared for this measurement (virtual endpoints only, zero real
quota): `tools/route-probe.mjs --preset classifier-allow` on 4731, the lab profile's
providers pointed at it, the reviewer route pinned as the **flat**
`autoReviewProvider/Model` pair (that is the pair `automode-compat` reads), and
`@log.li/dsh-automode` installed. Two blockers remain, both outside the adapter:

1. **The `Auto mode` preset must be selected**, and that is a session setting with no
   headless or profile-level equivalent: `defaultPreset: auto-mode` is validated at
   activation against the presets that exist then, while the `auto-mode` preset is
   registered later by the automode row — setting it in the patch fails the boot.
2. **The browser lane is unavailable to this agent.** `bcdp_navigate` and
   `bcdp_script` are review-gated, and the reviewer request for those plugin tools
   cannot be built: `auto-review: the pending native tool schema is missing or
   ambiguous`. Because the gate fails closed, the tool never runs.

That second item is a real limitation of the takeover, not of automode: **a plugin
tool whose schema cannot be serialised into the reviewer request is blocked under the
`Auto` preset.** Recording it here so the next change either serialises those schemas
correctly or documents an exemption path.

Ready-to-run recipe once a UI-capable lane exists (all virtual):

```
node tools/route-probe.mjs --port 4731 --log probe-automode.jsonl \
  --map '{"deepseek-flash":{"tool":"pwsh","args":{"command":"New-Item -Force C:\\temp\\probe.txt"}},"gpt-6-luna":{"preset":"classifier-allow"}}'
# boot the lab host, select the 自动审查/Auto mode preset, then ask for one command
# that writes outside the workspace; expect a gpt-6-luna row in the recorder.
```

## Auto preset blocks plugin tools whose schema the gate cannot resolve

Observed 2026-10-28 in the desktop profile with the session already on the Auto
preset:

| Tool | Lane | Outcome |
| --- | --- | --- |
| `pwsh` (core) | reviewed | runs after the reviewer answers |
| `bcdp_navigate` (plugin) | reviewed | never runs: `auto-review: the pending native tool schema is missing or ambiguous` |
| `bcdp_status`, `memory_list`, `read`, `grep` | pure-read allowlist | skipped by the gate, always run |

The message comes from the official gate's `nativeAction()` in
`@deepseek-ai/dsh-experimental-auto-review/lib/index.js`: it resolves the tool
schema out of `session.requestHeader().tools` and requires exactly one entry whose
`name` matches the pending call. Zero or two matches both throw, and the gate fails
closed, so the tool body never executes.

Leading hypothesis, not yet proven: `requestHeader()` is the session's most recent
LLM request, so an auxiliary request issued inside that session that carries no
`tools` array (session naming, memory distillation, compaction — calls this plugin
also routes) replaces the header the gate inspects, making the lookup fail.

Practical answer until this is settled: run plugin tools under 请求批准 or 完全放开,
or put a genuinely read-only plugin tool on the review allowlist (纯读工具免审查),
where the gate never builds a review request.

### automode, attempt 2 (2026-10-28, UI lane restored)

The browser lane works again once `bcdp_status` is called first (the plugin runs
`lazy` tool injection; see the user-level AGENTS.md rule). With that:

- a fresh lab session starts on 请求批准 and the `Auto mode` preset switches over
  successfully in the access-mode menu (**automode's own preset works**);
- the lab profile pins the **flat** `autoReviewProvider/Model` = probe/gpt-6-luna, and
  the plugin's own status confirms the adapter wrote it:
  `automode: {installed: true, route: "probe/gpt-6-luna", added: 0, skipped: 0}`;
- the scripted probe returned one `pwsh` tool call (delete a scratch directory
  outside the workspace), which the session executed/answered;
- **the recorder saw no `gpt-6-luna` request in three attempts** — only main-model
  rows. automode's own decision log (`~/.dsh/auto-mode/decisions.jsonl`) contains
  `boot` events only, no tool decision, so in these runs the classifier was not
  consulted at all.

Conclusion so far: the *route* is filled correctly, but a classifier call has never
been observed. Whether automode skipped these actions via its deterministic bands, or
resolves the classifier out of band, is still open — do not read this as "automode
routing works".

### Observation: automode re-activation burst

During that session the same decision log accumulated **at least 20 `boot` records
inside one ~15 s window** (the file holds 1868 `boot` records in total). The host
process itself did not restart (uptime was 169 minutes), and the burst stopped as soon
as the lab host was killed. A lab profile that carries automode plus this plugin can
therefore re-activate automode repeatedly; worth isolating before drawing conclusions
from any automode timing.

### Recompose churn (root-caused and fixed in v0.4.52)

With the optional auto-review bundle, `@log.li/dsh-automode` and `dsh-prime-memory`
all enabled in the lab profile, two churn signals appeared intermittently:
automode's `boot` decision records at ~1.5/s and the profile document's mtime
ticking every ~5-6 s, while the host process itself never restarted. Bisect:

| Composition | 30-40 s idle observation |
| --- | --- |
| without `dsh-model-switch` | 0 mtime ticks |
| with `dsh-model-switch` (0.4.50) | ~5-6 ticks, 68-136 automode boot records per window |
| with 0.4.51 hardening, run 1 | 6 ticks, 75 boot records |
| with 0.4.51 hardening, run 2 | 1 snapshot in a 25 s per-second watch (no rewrite) |

v0.4.52 root-caused it: the memory adapter's idempotence guard read the forms
descriptor value as the live section, while the descriptor returns the whole row
config (`{ llm, live }`); the guard therefore never matched and every activation
re-pushed the route through the memory plugin's settings-set RPC, which re-persists
its live section with a different key order — a document change that recomposes and
re-activates the adapter. Snapshot diffs during a churn window showed exactly that:
consecutive writes differing only in key order (`mdExportMaxRecords` moving). With the
guard accepting the nested shape, a 40 s window shows a single write (the initial
memory-row creation) and then silence.

### automode, attempt 3 (2026-10-28, post-churn, virtual / zero real quota)

With the recompose loop fixed (0.4.52) the measurement is trustworthy again. In the
lab (DSH 0.2.1-rc.3, automode v0.17.0, recorder `C:\dsh-artifacts\probe-am.jsonl`),
session on the `Auto mode` preset, four escalation-shaped scripted actions were run
through `route-probe --map`:

| Action | Observed handling | Classifier (gpt-6-luna) seen? |
| --- | --- | --- |
| `Remove-Item -Recurse -Force` outside workspace | denied in ~10 ms (bands.js: deletion is a hard-deny band) | no |
| `New-Item` file outside workspace | executed, then `[sandbox: file access denied under workspace-write mode]` | no |
| `Invoke-RestMethod` to a localhost endpoint | result in ~8 ms (allowed/executed) | no |
| same delete under 请求批准 (control) | executed, exit 1 from the sandbox | n/a |

automode's decision log (`~/.dsh/auto-mode/decisions.jsonl`) contains **only `boot`
records** across the whole window — no tool decision was ever written.

Conclusion: the classifier route that `automode-compat` injects
(`status.automode.route = probe/gpt-6-luna`, verified) is **not on the observed
decision path** of automode v0.17.0 for these action classes; escalations are resolved
by the deterministic bands and the sandbox instead. Until an action class that reaches
the classifier is found, the injection stays "written, not proven consumed" — do not
advertise automode routing as verified.
