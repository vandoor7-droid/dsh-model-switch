# DSH compatibility watch (automation state)

Automated daily check. When the `latest` dist-tag of `@deepseek-ai/dsh` moves,
update this plugin for the new line **without dropping older lines**.

## Baseline

| Field | Value |
|---|---|
| Last check | 2026-10-21 (Asia/Shanghai) |
| `@deepseek-ai/dsh` dist-tags | `latest` = `0.2.1-rc.2`, `next` = `0.2.1-rc.2`, `alpha` = `0.2.1-alpha.5` |
| Last verified line | `0.2.1-rc.2` |
| Plugin version at that check | 0.4.36 |

`latest` moving is the trigger. `next`/`alpha` are early signal only — record
them, do not update the plugin for them unless the same API change is already on
`latest`.

## Previously verified lines (must keep working)

`0.1.7-alpha.2`, `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.2`, `0.2.1-rc.2`

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
   (`DSH_HOME=~/.dsh-lab`, port 3082), boot it, and drive one real tool call
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
