# dsh-prime-memory: distillation-route adapter

How Model Switch can pin `dsh-prime-memory`'s distillation model without taking
over anything. Everything below was verified on DSH **0.2.1-rc.3** with
`dsh-prime-memory@0.26.10` in the lab plane (`DSH_HOME=D:\dsh-lab`, port 3082).

## Why no takeover

`dsh-prime-memory` keeps its distillation route in its own settings, not in a
slot another plugin can claim:

| Layer | Where it lives | Notes |
|---|---|---|
| Primary route | `live.distillChain[0]` | `{ provider, model, reasoningEffort? }` |
| Fallbacks | `live.distillChain[1..]` | tried in order, deduplicated by the plugin |
| Per-layer chains | `live.layerRoutes` | l1 / l2 / l3; the graph layer has none |
| Secondary route | `live.secondary*` | only for inputs above a char threshold |
| Legacy keys | `live.distillProvider` / `live.distillModel` | projected into the chain when no chain is set |
| Legacy/absent config | `config.llm.provider/model` | otherwise the current default model |

The plugin reads that section through its own handle and commits writes with
`ctx.settings.update('dsh-memory', { live })`, which the Host applies as a
**volatile-only** config commit — no remount, no restart.

So the adapter writes one key and nothing else; it never registers a provider,
never wraps a request, and never touches the plugin's code or its other switches
(capture, trace, embedding, memory mutation).

## Contract (implemented in `src/prime-memory-route.ts`)

```ts
isPrimeMemoryRow(entry)             // package name is authoritative; row id is the fallback
primeMemoryRows(entries)            // every composed row naming the package
planDistillChain(primary, existing) // chosen route first, existing fallbacks kept, deduped, blanks dropped
distillChainPatch(chain)            // { live: { distillChain } } — no other keys
```

Rules the planner keeps:

- a chosen route with a blank half is ignored (the existing chain is left alone);
- a fallback equal to the chosen route is dropped (a duplicate is a guaranteed
  second failure, not a fallback);
- blank halves on either side are dropped;
- an empty result is an empty chain, never a guessed model.

## Verified recipe (works today, no code changes)

Profile patch (`D:\dsh-lab/profiles/lab/cordis.patch.yml`) — a top-level row, not
an `insert:` (an insert with the same id fails startup with a duplicate-entry
error):

```yaml
- id: dsh-memory
  config:
    live:
      distillChain:
        - provider: deepseek-account
          model: deepseek-flash
```

After a restart the plugin's own 「记忆」 settings page showed

```
主 | DeepSeek Account（deepseek-account） | DeepSeek-V4.1-Flash（deepseek-flash）
```

which is the read-back proof that the Host accepted the volatile section and the
plugin applies it.

## What Model Switch will surface

A fifth capability card (deployment-wide, no per-provider group — distillation is
a global pipeline, not a session route):

- **follow its own settings** (default; writes nothing),
- **pin a route** (writes `planDistillChain(route, current)`),
- shows the chain that would be written before any write happens.

Until that card exists, the recipe above is the supported path, and
`src/prime-memory-route.ts` is the implementation the card will call.

## Compatibility notes

- `engines.dsh` of `dsh-prime-memory@0.26.10` lists `0.2.1-rc.3` (and older
  lines) explicitly, so it is inside the Host's hard allowlist; `engines.node`
  requires `>= 22.16.0`.
- It depends on native modules (`sqlite-vec`, `@node-rs/jieba`); the lab install
  resolved them without a build step on Windows x64.
- Model Switch and prime-memory do not compete for any seam: prime-memory does
  not register a `sessionTitle` provider or a permission preset, and its tools
  are its own `memory_*` family.

## Lab result: the route does not move (2026-10-26)

Verified on DSH 0.2.1-rc.3 with `dsh-prime-memory@0.26.10` — **neither public seam
changes the model a distillation call actually uses**:

| Attempt | Result |
|---|---|
| Patch the row config (`entry.options.config.llm.provider/model`) | No effect: the plugin reads its config once at init |
| Same, plus a `loader/entry-init` listener and a late sweep | No effect |
| `settings.update('dsh-memory', { live: { distillChain } })` | **Write lands** (visible in the profile patch, survives a restart, and the plugin's own settings page shows it) — but the calls still run on `apigoto/deepseek-flash`, the deployment default |
| Clean restart, then `memory_ruminate` | Still `apigoto/deepseek-flash` |

`memory.log` recorded `LLM 调用 apigoto/deepseek-flash` on every distillation round
(L1/L2/L3), while the configured chain was `apigoto/mimo-v2.6-flash`.

**So**: the settings write is real, but it feeds the plugin's *displayed* chain, not
the route its distillation calls resolve. The adapter in
`src/prime-memory-compat.ts` is therefore an **unverified experimental path**, and
the "memory distillation follows the provider group" capability must not be
advertised as working. Reverting the claim in `CHANGELOG.md` (v0.4.44) is part of
this note.

Next step if this is ever picked up again: find where the plugin resolves `cfg` for
a distillation call (its `effectiveCfg` path) and inject there, or drop the
capability from the settings page.


## Route resolution in dsh-prime-memory 0.26.11 (source read, 2026-10-28)

The earlier negative result was read against 0.26.10 through the config-mutation
door only. Reading 0.26.11's own sources narrows the real seam:

- `dist/llm.js:58 resolveModelRoute(ctx, cfg)` — `cfg.llm.provider && cfg.llm.model`
  wins; otherwise `requireExplicitRoute` checks apply, then
  `ctx.get('agentDefaultModel').currentSelection()` supplies the fallback.
- `dist/index.js:278` — `const cfgView = effectiveCfg(config, live)` is computed **per
  call**, so a live settings value is honoured without a restart.
- `dist/pipeline/runner.js:47 effectiveCfg(cfg, live)` — precedence:
  `pinned` (static `cfg.llm.provider+model`) disables every chain form, then a
  non-empty `live.distillChain` takes over, then
  **`live.distillProvider` + `live.distillModel`** (only while `!pinned` and no chain),
  then the static config.
- `dist/config.js:41` declares `distillProvider` / `distillModel` in the plugin's own
  settings schema, and `dist/settings.js:14` projects that pair into a single-entry
  chain when `distillChain` is empty.

So the lever we never tried is `live.distillProvider` / `live.distillModel` written
through the plugin's own `dsh-memory/settings-set` RPC (the client itself resets with
that exact shape, `dist/client.js:38514`). Writing `distillChain` was the wrong key for
a pinned-free profile; writing the static row config only lands at the next start.

Next implementation step: write both `distillProvider` and `distillModel` via that RPC,
then assert with `tools/route-probe.mjs` that L1/L2/L3 requests carry the configured
model. Unverified until that run exists.

### Why the shipped adapter could not move the route (0.4.44–0.4.48 code)

`src/prime-memory-compat.ts` sends `dsh-memory/rpc/settings-set` with

```js
distillChain: [{ provider: route.provider, model: route.model }],  // line 241
distillProvider: '',                                               // line 247 (cleared)
```

and separately persists a static pin through `distillChainPatch(...)` (line 393).
Against `effectiveCfg` that is self-defeating:

- the static pin makes `pinned === true`, and `pinned` disables **both** chain forms
  (`chainMode = chain.length > 0 && !pinned`, and the layer chains are also gated on
  `!pinned`), so the pushed chain is ignored;
- the legacy pair that *would* survive a pinned-free profile is deliberately cleared.

Fix for the next round (in this order):

1. Stop writing the static pin from this adapter, or write it only as a
   last-resort fallback for profiles that never mount the live path.
2. Send `distillChain: []` and `distillProvider/distillModel` = the resolved route, so
   `effectiveCfg`'s third branch supplies the route (`!chain.length && !pinned`).
3. Assert with `tools/route-probe.mjs` that L1/L2/L3 carry that model, then decide
   whether a restart is still required (the pair is live, so it should not be).

## Ready-to-run virtual measurement recipe (next round)

```bash
# 1) install the memory plugin into the isolated rc.3 lab (virtual only)
cd /d/项目/dsh-model-switch
npm pack dsh-prime-memory@0.26.11 --pack-destination /tmp/pm
mkdir -p /tmp/pm/x && tar -xzf /tmp/pm/dsh-prime-memory-0.26.11.tgz -C /tmp/pm/x
cp -a /tmp/pm/x/package /c/Users/15726/.dsh-lab3/profiles/lab/node_modules/dsh-prime-memory
# add a row to the lab patch (name: 'dsh-prime-memory'), no real key anywhere

# 2) probe: give the memory route its own model id so attribution is unambiguous
node tools/route-probe.mjs --port 4719 --log .scratch/probe.jsonl --clear \
  --map '{"gpt-6.1-sol":{"answer":"ok"},"probe-memory":{"preset":"memory"}}'

# 3) host (already virtualized: apigoto -> 127.0.0.1:4719, PROBE_API_KEY)
bash .scratch/start-lab3.sh

# 4) in the UI: 设置 → 模型切换 → 记忆蒸馏模型 = apigoto/probe-memory, then
#    run one `memory_ruminate` (or send one turn) and read the probe log:
node -e "const l=require('fs').readFileSync('.scratch/probe.jsonl','utf8').trim().split('\n');for(const x of l){const j=JSON.parse(x);if(j.model==='probe-memory')console.log('HIT',j.ts)}"
```

Pass criterion: at least three `HIT` lines (L1 extraction, L2 integration, L3 profile)
with `model=probe-memory`, no `mimo-v2.6-flash`/deployment-default rows for those calls;
then repeat after changing the route once — a second route should take effect **without a
restart** (that is the point of the live pair). Only then set `MEMORY_CAPABILITY_UI = true`
and release v0.4.49.
