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

## Attribution gotcha

The memory plugin posts a distillation call after every turn. With its route pointed at
the recorder those calls appear as periodic `stream: true` rows and can be mistaken for
another route's traffic. Confirm a row's owner from `memory.log` (which prints the model
per call) before attributing it. Review calls are also streaming (`llm.stream()`), so
"non-streaming means review" is a wrong discriminator; use a distinct model name for the
route under test instead.
