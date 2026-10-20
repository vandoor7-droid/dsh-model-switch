# Auto-review takeover visibility (planned, not implemented)

Status: **design only**. v0.4.32 ships the behaviour (the reviewer path is
shielded instead of failing tool calls) but the only signal a human gets is one
`logger.warn` on the Host console. This note fixes the shape of the missing
piece so it can be implemented without re-deriving it.

## What the human needs to see

| Host state | Card text | Severity |
|---|---|---|
| `presets.registered === true` | current `autoReviewTakeoverNote` (static) | informational |
| `presets.registered === false` and the shield allowed a call | "审查路由未接管：工具已放行、本次未审查。**重启 DSH** 收敛。" | warning |
| the official row could not be disabled at all (`reclaimOfficialAutoReviewRow` exhausted, no late reclaim yet) | same as above, plus "官方行仍在服务" | warning |

The third state is the one that should also stay visible after the restart that
converges it, until the next successful claim clears it.

## Where the state lives (host side)

`src/auto-review.ts` already owns the truth (`presets.registered`, the
`installToolCallSafetyNet` warn path). It must publish it instead of only
logging:

1. A small mutable record, e.g.
   `{ held: boolean; allowedCalls: number; lastError?: string }`.
2. Updated in `apply()` after the takeover settles and again from the shield's
   catch (incrementing `allowedCalls`), plus after `claim()` succeeds in the
   late re-claims (`src/auto-review-takeover.ts`).
3. Exposed through the plugin's **existing runtime-capability channel**
   (`src/runtime-capabilities.ts` and the client's `src/client/plugin-rpc.ts` —
   *not* `src/capabilities.ts`, which is the model-capability catalog), i.e. one
   new field next to the other runtime capabilities — **not** through
   `ModelSwitchSettings`, which is a settings payload and must stay
   stable/serialisable across revisions. Confirm the exact surface at
   implementation time.

## Where it renders (client side)

`src/client/ModelSwitchSettings.tsx` line ~559 already renders
`props.t('autoReviewTakeoverNote')` inside the「自动审查」section. Replace that
static paragraph with a component that:

- reads the capability field through the same channel the other runtime
  capabilities use (see `src/client/index.tsx` wiring);
- renders the informational note when held, the warning block otherwise;
- keeps a "重启 DSH 生效" phrasing so the fix is actionable;
- adds locale entries in `src/client/locales.ts` (zh + en) rather than inlining
  strings.

## Tests

- Unit (host): the published record flips to `held: false` when the takeover
  reports the lost seam, increments once per allowed call, and returns to
  `held: true` after a late reclaim.
- Unit (client): the card renders the warning when the capability says
  `held: false` and the informational note otherwise (existing test file for the
  settings card holds these).
- Lab: enable the official row at runtime on 3082 → the card shows the warning,
  a tool call succeeds with one log line; restart → the warning clears.
