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
| Auto review | **no** | The official gate `@deepseek-ai/dsh-experimental-auto-review` is not part of this lab profile, so the reviewer override never mounts. Installing it is rejected: `0.1.6-alpha.1` declares `^0.1.6-alpha.1` peers against DSH `0.2.1-rc.3`. Forcing it needs `dsh plugin allow-version … --accept-risk` |
| automode | **no** | `@log.li/dsh-automode` was not installed in the lab; untested |

## Notes on the two unmeasured rows

Both are environment gaps, not observed failures. Nothing in this repository claims
they work: the plugin only rewrites the route of whichever gate is active, and when the
gate is absent the adapter logs
`model-switch: auto-review bundle is not active in this profile; the reviewer route override stays unmounted`.

To measure auto review, either accept the risk of forcing
`@deepseek-ai/dsh-experimental-auto-review@0.1.6-alpha.1` onto DSH `0.2.1-rc.3`, or run
the check in a profile that already has a compatible gate. Until then the reviewer route
stays "unverified" here even though its rewrite path is covered by unit tests
(`tests/auto-review.spec.ts`).

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
