# 2026-10-31 — 插件在真实桌面上「启用失败」的取证与修复

## 症状

桌面插件市场点启用后报：

```
启用失败：dsh: warning: 1 entry did not activate
model-switch-auto-review (dsh-model-switch/auto-review): pending (waiting for service: modelSwitch)
```

同一状态下，非白名单工具（`ops_bash` 等）也报
`auto-review: the pending native tool schema is missing or ambiguous`（文案来自官方
`@deepseek-ai/dsh-experimental-auto-review`，因为它接管着审查位）。

## 取证（只读，全部复核过）

| 检查 | 结果 |
| --- | --- |
| 桌面 DSH 版本 | `resources/runtime/primary-runtime/runtime.json` → `desktopVersion: 0.2.1-rc.5`，与复现用 CLI 同版本 |
| 桌安装插件 | `profiles/desktop/node_modules/dsh-model-switch/package.json` → `0.4.55` |
| `dsh.profile.bundles` | **不含** `dsh-model-switch`；patch 里只有 `- id: model-switch` 这类行 |
| asar 里的可选 peer | `dsh-launch-environment`、`dsh-tools`、`dsh-client-connection`、`dsh-credentials`、`dsh-web-search-deepseek`、`cordis` **全部存在**（用 asar 头部清单读出 307 个包） |
| 入口 import 图 | 0.4.53 与 0.4.55 的 `lib/index.js` 顶层 import **完全一致**，不是新版本引入的缺包 |
| `- id:` 语义（rc.5） | 复现 profile 里 `- id: model-switch` 只报 `patch: entry "model-switch" not found`，**不会创建行**；`--dump-config` 里也没有该行 |
| 三种挂载矩阵 | 仅 bundle / 仅手工行 / 两者并存，用同一份 0.4.55 产物启动都正常；把桌面的完整 `config`（含 `providerGroups`）与那 5 条 `disabled: true` 行一起搬进复现 profile 仍正常 |

结论：**依赖行把 `modelSwitch` 写进了静态 `inject`**。Cordis 的 `inject` 只有必选形式，
一旦主行没有提供服务（未挂上、apply 抛错被回收、或组成里只剩依赖行），该行就永久
`pending`，并**阻塞同一组成中它之后的所有行**——这就是"启用失败"与"其它包也打不开"的机制。
另外主行的所有安装动作都在构造函数里，任一安装器抛错会让 fiber 失败并被回收，
`modelSwitch` 随之消失，正好构成上面的前置条件。

## 修复（0.4.56）

1. `ModelSwitchRuntime` 在 `super(ctx, 'modelSwitch')` 之后的全部安装动作包进 try/catch：
   安装器抛错只记日志，服务保留，依赖行不再被连坐。
2. 五个依赖行不再把 `modelSwitch` 写进 `inject`，改为 `ctx.get('modelSwitch', false)` 惰性读取：
   - `model-switch-auto-review`（服务缺席 → warn 后不挂审查位，官方门保持原样）
   - `model-switch-review-timeout`（warn 后不动超时）
   - `model-switch-automode-compat`（warn 后不动分类器路由）
   - `model-switch-prime-memory-compat`（warn 后不动蒸馏路由）
   - `model-switch-subagent-runtime`（服务缺席 → 挂官方 subagent 运行时，路由不覆盖）
3. 直接属性访问 `ctx.modelSwitch.currentSettings()` 全部改为惰性读取，避免
   `cannot get property "modelSwitch" without inject`。

## 验证

- `pnpm run check` 全绿（65 文件 / 627 测试 + pack 闸门）。
- lab（`DSH_HOME=D:\dsh-repro`，DSH 0.2.1-rc.5，virtual / 零真实额度）：
  - `reproA`（bundle 正常挂载）→ 启动正常；
  - `reproE`（**只插入 `model-switch-auto-review` 行、完全不挂主行**）→ 启动正常，
    **没有** `did not activate` / `pending`；这正是修复前会死锁的场景。
- **未验证**：真实桌面上的启用（需用户重试），以及主行安装器在桌面环境里究竟哪个抛错
  （修复后它只会留下日志、不再致命）。

## 追记（0.4.57）：0.4.56 的"惰性取服务"是错的

0.4.56 为了不出现 pending，把依赖行的 `inject: ['modelSwitch']` 改成
`ctx.get('modelSwitch', false)`。实测证明这个写法在真实宿主上**永远取不到服务**：Cordis 的
服务只在声明依赖的作用域内可见，跨行直接 `get` 返回 `undefined`。结果是四个适配器
（auto-review / review-timeout / automode / prime-memory）行都在、但什么也不做，
`status.primeMemory` 显示 `installed:false` 或 `routeSkipped:'no-service'`。

0.4.57 改为 `ctx.inject(['modelSwitch'], scope => …)`：不阻塞组态（不会 pending），
且作用域内能真正读到服务；记忆适配器再嵌套注入 `webServer`，因为写入插件 live 设置的
唯一即时通道是它自己的 RPC。推送改为**回读校验**——宿主对缺少会话凭据的本地写入会
返回 200 却丢弃内容，所以以插件 `settings-get` 的回读为唯一成功判据，不匹配则回落文档
写入并标 `live-rejected`（下次启动生效）。

lab 复核（DSH 0.2.1-rc.5 + `dsh-prime-memory@0.26.16`，virtual / 零真实额度）：
清空 live 路由后启动 → 回读到配置值；设置页改路由保存 → 不重启即生效（`replays:1`）；
`ruminate-start` → 探针记录到配置的 `deepseek-flash`（默认是 `gpt-6.1-sol`）。
