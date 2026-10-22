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

## 运行时 UI 验证：用 dsh-browser-cdp，禁止另起可见窗口

- 需要在运行时验证 Web UI（设置页、会话面板、插件卡片、热更新后的界面）时，**用已安装的 `dsh-browser-cdp` 插件提供的 `bcdp_*` 工具**（`bcdp_status` / `bcdp_navigate` / `bcdp_snapshot` / `bcdp_script` / `bcdp_space`），在独立 task space 里操作。
- **不要**用 `Start-Process msedge.exe --remote-debugging-port …` 另开可见浏览器：会反复弹窗、抢占前台、打断用户的工作。
- 标准流程：`bcdp_navigate` 打开 `http://127.0.0.1:3082/?token=<token>`（lab）→ `bcdp_snapshot` 取语义树与 `loc=` → `bcdp_script` 一次脚本完成多步交互与断言。表单提交要点击页面上的「发送消息」按钮，只发 Enter 不会提交。
- 元素定位优先用 snapshot 的 `loc=`（跨调用稳定），不要用每次重排都会变的 `ref=`。
- 只有 `bcdp_*` 确实不可用（插件未装 / `bcdp_status` 探测失败 / 浏览器起不来）时才回退到自起浏览器，且**回退前先说明原因**；验证结束必须清理：关闭 task space、停掉 host、杀掉自起进程、还原改动过的 profile patch。

## 发布：npm 自动发包（每次版本更新必走）

- 每次对外发布（版本更新）必须走 `.github/workflows/release.yml` 的自动发包流程：推 `vX.Y.Z` 标签触发，工作流跑完发布闸门后用 npm trusted publishing（OIDC）发布到 npm 并创建 GitHub Release。禁止手动 `npm publish`，不使用 npm token / 2FA 发布路径，也不在任何机器或 GitHub secrets 存放 npm 凭据。
- 发布序列（每一版照此执行，顺序不可换）：
  1. 写好 `CHANGELOG.md` 的版本条目，把 `package.json` 版本号升到 `X.Y.Z`；
  2. `pnpm run check` 全绿（tsc + tsdown + 全部测试 + pack 闸门）；
  3. 提交，并打与版本号一致的标签 `vX.Y.Z`（工作流强制校验 `v` + package.json version 一致，不一致直接失败）；
  4. `git push && git push origin vX.Y.Z`——标签即发布，无需其他操作。
- 发布自主权（2026-10-15 起）：**功能性/行为性更新（大更新）在推送到 `main` 后直接按上面的序列发版、打标签、推标签，无需逐次等用户确认**；**纯文档/措辞更新只推送 `main`，不发包、不打标签**。判定看改动是否触及运行时或用户可见行为（`src/`、构建产物 `lib/`、`cordis.patch.yml`、`package.json` 版本与依赖、`PRODUCT.md` 的冻结范围）——只改 `README*`、`docs/`、`CHANGELOG.md` 措辞、代码注释的属于“只推送”。拿不准时按“只推送”处理，等用户明示后再发。
- 发布前提：npmjs.com 该包的 Trusted Publisher 已配置为 GitHub Actions（`vandoor7-droid` / `dsh-model-switch` / `release.yml`，Environment 留空）。该配置闲置不用会过期，长期未发版后应在推标签前重新确认。
- `workflow_dispatch` 只跑发布闸门、绝不发布；只有标签触发才会 `npm publish`。本地改完版本但尚未打标签时，仓库随时可继续提交，不存在误发风险。
- 发布后核对：npm `latest` dist-tag 指向新版本、GitHub Release 已生成；失败时看 Actions 日志中的 OIDC 校验步骤（它会给出授权缺失等明确错误）。
