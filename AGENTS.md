# Model Switch agent policy

This repository inherits `../AGENTS.md`; read it before changing this checkout.

- Keep every implementation, compatibility adapter, test, and build rule in this plugin. Treat DSH Core and every official DSH checkout/tag as read-only.
- Validate only against a clean official DSH tag and, in runtime milestones, the lab plane (`DSH_HOME=~/.dsh-lab`, port 3082). Milestone 1 is pure-module/package validation and does not deploy.
- Use only released public DSH/Cordis interfaces. When a required public seam is absent, keep that runtime capability disabled and fail with an explicit error; record the seam for a later upstream proposal.
- The frozen scope is authoritative in `PRODUCT.md`; use `IMPLEMENTATION_PLAN.md` for milestone sequencing. `SPEC.md` is historical and superseded.
- Preserve the product/package/bundle/page identity: **Model Switch** / `dsh-model-switch`.

## DSH 版本兼容

- 官方 DSH Host 包（`@deepseek-ai/dsh` 及 `@deepseek-ai/dsh-*`）在 `package.json` 的 `dependencies`、`optionalDependencies`、`devDependencies`、`peerDependencies` 中使用无上界的下限范围 `>=最低已验证兼容版本`；不得用精确版本或带上界的范围限制后续版本。锁文件、构建输入和安装/发布工件选择器可固定实际验证的版本。
- 对有明确公开 API 或协议兼容承诺的 DSH 插件 peer，也使用无上界的下限范围 `>=最低已验证兼容版本`。未定义兼容承诺的插件协议应先定义并验证；不要仅凭包名放宽版本。插件 peer 新版本通过互操作测试和构建后，再声明兼容。
- 声明兼容新 DSH release 前，审查其公开 API 变化与插件实际调用，运行相关测试和 `pnpm run build`，并在 3082（`DSH_HOME=~/.dsh-lab`）验证；全部通过后再宣称兼容。

## DSH 源码与开发者文档

- DSH Core 的源码与开发者文档可从公开仓库 `github.com/deepseek-ai/deepseek-harness` 按与已验证版本对应的 tag/commit 拉取参考；官方 npm 包（`@deepseek-ai/dsh` 及 `@deepseek-ai/dsh-*`）随附的实现同样可读。
- 参考检出放在 git-ignored 的 `reference/` 目录或 `%TEMP%` 下，不进入本仓库、不参与构建；DSH Core 与任何官方 tag/检出一律只读，修改只发生在本插件仓库。
- 拉取或检索失败时按全局搜索回退规则处理（原生 `web_search` ↔ `web_search_pro`）；仍不可用时直接核对已安装的官方包实现（node_modules 或运行时安装目录）。

## 发布：npm 自动发包（每次版本更新必走）

- 每次对外发布（版本更新）必须走 `.github/workflows/release.yml` 的自动发包流程：推 `vX.Y.Z` 标签触发，工作流跑完发布闸门后用 npm trusted publishing（OIDC）发布到 npm 并创建 GitHub Release。禁止手动 `npm publish`，不使用 npm token / 2FA 发布路径，也不在任何机器或 GitHub secrets 存放 npm 凭据。
- 发布序列（每一版照此执行，顺序不可换）：
  1. 写好 `CHANGELOG.md` 的版本条目，把 `package.json` 版本号升到 `X.Y.Z`；
  2. `pnpm run check` 全绿（tsc + tsdown + 全部测试 + pack 闸门）；
  3. 提交，并打与版本号一致的标签 `vX.Y.Z`（工作流强制校验 `v` + package.json version 一致，不一致直接失败）；
  4. `git push && git push origin vX.Y.Z`——标签即发布，无需其他操作。
- 发布前提：npmjs.com 该包的 Trusted Publisher 已配置为 GitHub Actions（`vandoor7-droid` / `dsh-model-switch` / `release.yml`，Environment 留空）。该配置闲置不用会过期，长期未发版后应在推标签前重新确认。
- `workflow_dispatch` 只跑发布闸门、绝不发布；只有标签触发才会 `npm publish`。本地改完版本但尚未打标签时，仓库随时可继续提交，不存在误发风险。
- 发布后核对：npm `latest` dist-tag 指向新版本、GitHub Release 已生成；失败时看 Actions 日志中的 OIDC 校验步骤（它会给出授权缺失等明确错误）。
