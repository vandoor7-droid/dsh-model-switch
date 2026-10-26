# dsh-prime-memory: distillation-route adapter

How Model Switch can pin `dsh-prime-memory`'s distillation model without taking
over anything. Everything below was verified on DSH **0.2.1-rc.3** with
`dsh-prime-memory@0.26.10` in the lab plane (`DSH_HOME=~/.dsh-lab`, port 3082).

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

Profile patch (`~/.dsh-lab/profiles/lab/cordis.patch.yml`) — a top-level row, not
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
