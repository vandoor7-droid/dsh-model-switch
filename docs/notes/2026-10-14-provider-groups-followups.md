# Provider groups：三个待修正项

v0.4.22（`508e9ef`）冒烟与代码复核中确认的三个问题。均已评估，无发布阻塞；按用户决定先记录、后续版本修正。

## 1. 组应用只覆盖两个插件自有切换面（功能边界）

**现状**：`providerGroups` 只在输入框选择器 `directoryFace.select()`（会话切换且供应商变化）与 Main 卡 `saveMain()`（保存了不同供应商）时自动应用。TUI 切换、`dsh headless`、其他插件直接调 `session.selectModel`、Agent 预设自选模型均不触发；混用切换面的用户会感觉"组时灵时不灵"。设计原因：只有这两条路径是本插件的代码；无公共 seam 可订阅"会话模型已变更"；故意不加设置命名空间 watcher（Main 默认值补偿流程本身会短暂写默认值，watcher 会误触发）。

**修正方向**：若 DSH 暴露会话选择变更的公共事件，订阅后补应用；届时在 `docs/seam-gap.md` 走上游提案。现状已写入 README 双语与 CHANGELOG。

**涉及**：`src/client/picker/install.tsx`（select 接线）、`src/client/index.tsx`（saveMain 接线）。

## 2. 选择器切换后 Main 默认值偶发不还原（既有竞态）

**现状**：冒烟三次切换中一次 Main 默认值停留在切换后的模型（应还原为切换前值）。既有问题，0.4.18 起已记录：0.2.x Host 的部署默认值写入不 await（`main-default-restore.ts` 模块头注释），补偿有两处竞态窗口——① 写入迟到于 750ms 等待上限（`DEFAULT_WRITE_WAIT_MS`）被误判为"Host 不写默认值"；② 补偿写回后 Host 迟到写入把它盖掉。栅栏被拒且修订又动时让并发编辑胜出（`conflict: true`）。与组功能无关：组写的是 `model-switch` 命名空间，纯选择器切换同样可复现；具体子机制（窗口①/②/栅栏冲突）冒烟未插桩区分。后果仅限新建会话的默认模型漂移，重存一次 Main 即恢复。

**修正方向**（任选，均有取舍）：加长等待窗口（代价：从不写默认值的 Host 每次切换白等满窗口）；延迟二次补偿、仅当默认值仍等于刚切换到的模型才写回（代价：人恰好保存同一模型会被误覆盖）；上游提案 Host await 默认值写入或暴露"已写"事件（根治，走 seam-gap）；或接受漂移、维持现状。

**涉及**：`src/client/picker/main-default-restore.ts`（`restoreMainDefault`/`waitForAdvance`），测试 `tests/picker/main-default-restore.spec.ts`。

## 3. 子代理卡片摘要「Provider 默认 · high」措辞（显示层）

**现状**：子代理卡片摘要公式（`ModelSwitchSettings.tsx:357`）对任何固定路由都输出 `Provider 默认 · <生效 effort id>`；生效 effort = `draft.reasoningEffort ?? 模型默认 effort`（`:228`）。两个问题：① 显式固定 effort 时前缀仍写「Provider 默认」，与下拉里的「使用提供商默认值」语义冲突、读起来像没设置；② effort 以原始 id 小写拼接（`high`），与下拉标签 `High` 不一致。数据与写入均正确（冒烟展开卡片核对过 provider/model/effort 三个下拉），纯显示歧义。组编辑器子代理行用 `routeName`（不带 effort 后缀），不受影响。

**修正方向**：文案层小改——区分「已固定 · High」与「Provider 默认 · High」，effort 走本地化标签。影响 `tests/settings-ui.client.spec.tsx` 摘要断言（现有 `providerDefaultShort` 断言）与 `tests/client.spec.ts` 的 `subagentSummary` 断言，半天内。

**涉及**：`src/client/ModelSwitchSettings.tsx:356-357`、`:228`；`tests/client.spec.ts`、`tests/settings-ui.client.spec.tsx`。
