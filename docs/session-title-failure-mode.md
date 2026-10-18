# Why automatic session naming silently kept the fallback title

Operator note for v0.4.26. It records the evidence behind the naming fallback chain and the
result of the live probe against the pinned `ark/ark-code-latest` route.

## Symptom

A brand-new session got its first prompt, the composer kept working, and the session title
stayed at DSH's deterministic fallback. No error surfaced in the UI.

## What the session record showed

- The session log contained one `session/title-llm-request` event with the route
  `ark/ark-code-latest`, `maxTokens: 64`, the `first-prompt` cadence, and the root session id.
  Naming **did** trigger, and the plugin dispatched exactly the configured route.
- No provider title ever arrived; the official service logged one warning
  (`automatic title generation failed: …`) and kept the fallback.
- Correlation across the recorded sessions: **5/5** failing sessions routed to
  `ark/ark-code-latest`, **10/10** succeeding sessions routed to other routes.
- In every failing session the title request was emitted 1–5 ms after the main
  `request/header` — the auxiliary call runs concurrently with the main turn on the same
  account — and the main loops of those same sessions carried `RATE_LIMIT`
  (`RequestBurstTooFast`, `AccountRateLimitExceeded`, `AccountQuotaExceeded`) or `TRANSPORT`
  failures.
- Supersession was ruled out: the official service only aborts an in-flight title attempt
  inside its `count === 1` branch, so later user messages in the same session cannot have
  cancelled it.

## Live probe after the weekly quota reset (2026-10-19 ~00:08 +0800)

The pinned route was probed directly with the exact system prompt and framed input from the
recorded request.

| Probe | Result |
| --- | --- |
| quota exhausted (before reset) | `HTTP 429 AccountQuotaExceeded`, reset reported as `2026-10-19 00:00:00 +0800` |
| `max_tokens=64` (as shipped), thinking enabled | `HTTP 200`, `finish: stop`, title returned, 2.7 s, 63 completion tokens (57 reasoning) |
| `max_tokens=256` | `HTTP 200`, `finish: stop`, title returned, 3.3 s, 93 completion tokens (87 reasoning) |
| `max_tokens=8/16/24`, thinking enabled | `HTTP 200`, `finish: stop`, full title returned, completion tokens **above** the cap (66–134) |
| `max_tokens=8/16/64`, thinking disabled | `HTTP 200`, `finish: stop`, title returned, 0.5–0.7 s, **6** completion tokens |

What the probe establishes:

1. The failing call was rejected by rate limiting / quota (or transport), not by the service
   refusing to title the session.
2. On this endpoint `max_tokens` does not truncate: even an 8-token budget returned a complete
   title with `finish: stop`. Max-token truncation was therefore **not** the observed failure
   mode, so the widened-budget retry is a defence for other providers, not the fix.
3. Thinking costs the auxiliary call 2.6–5.0 s and 57–134 reasoning tokens; with thinking
   disabled the same title costs 0.5–0.7 s and 6 tokens. The pre-0.2.1 line has no effort
   control, so on 0.2.0 the auxiliary call is long and reasoning-heavy exactly when the main
   turn is also hammering the same account.

## Fix mapping (v0.4.26, `src/session-title.ts`)

| Evidence | Fix |
| --- | --- |
| 429 / quota / transport rejection of the auxiliary call | route fall-through: group pair → deployment pair → row pair → session route, retried per candidate |
| possible max-token truncation on other endpoints | one widened-budget retry (`min(4 × maxOutputTokens, 4096)`) on the same route |
| slow, reasoning-heavy auxiliary call on the pre-0.2.1 line | least supported reasoning effort on the 0.2.1 line, mirroring the shipped provider |
| silent permanent fallback | one warning naming every route tried, after all candidates failed |

Nothing is persisted by a fallback: the stored route and the pinned first choice stay as
configured (`PRODUCT.md`, "Session naming").

## Known limits

- The desktop app is still `0.2.0-rc.2`; the live 0.2.1 naming differential is re-checked after
  the app update.
- The lab plane's 3082 capability RPC was not exercised from a browser in this environment, so
  the 0.2.1 claim rests on the package-surface review, the unit suite, the real-package line
  checks, and the lab boot.
