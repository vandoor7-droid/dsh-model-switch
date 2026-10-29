# Crash forensics — 2026-10-29 19:26:44 host exit 1

## 结论（先说）

崩溃发生在**官方 `@deepseek-ai/dsh-experimental-inspector`**：它的 worker 套接字中断后，
`HostBridgePublisher.setState` 在 source 已关闭时**抛错**（同文件的 `publish` 是静默返回），
该异常从 cordis 生命周期事件回调里逃逸成 `dsh: fatal uncaught exception`，host 以 1 退出。
**不是 `dsh-model-switch` 的代码导致的**：崩溃栈里没有任何一帧来自本插件，且当时桌面安装的
0.4.42 **不含** prime-memory 路由适配器（`prime-memory-compat.js` 自 0.4.50 才有），
所以那套"重复写 live 路由 → 重组 churn"的机制在 0.4.42 上根本不存在。

## 证据

崩溃日志：`C:\Users\宋晔桐\AppData\Roaming\@deepseek-ai\dsh-desktop\logs\crash-2026-10-29T11-26-44-446Z-host.log`

1. 崩溃前供应商连续失败（`api.deepseek.com`，官方 deepseek-account 供应商）：
   - 7 × `[deepseek-account] request failed {path: '/api/v0/users/get_user_summary', errorCode: 'no-response'}`
   - 3 × `[llm-deepseek-account] model listing from https://api.deepseek.com/models failed … timed out after 5000 ms`
2. inspector worker 先死：
   - `dsh inspector: Worker stopped unexpectedly Error: write ECONNABORTED`
   - 位置 `dsh-experimental-inspector/lib/worker.js:5112`（`InspectorEndpoint.handleUpgrade` → `socket.end`）
3. 随后致命：
   ```
   dsh: fatal uncaught exception: Error: inspector: Host source is closed
       at HostBridgePublisher.setState (…/dsh-experimental-inspector/lib/index.js:1108)
       at HostInspectorSource.setState (…/lib/index.js:836)
       at …/lib/index.js:2322
       at publish (…/lib/index.js:2294)
       at ChildProcess.<anonymous> (…/resources/app.asar/lib/main.js:3844)
   ```
4. 代码级不对称（`D:\dsh-lab\runtime\node_modules\@deepseek-ai\dsh-experimental-inspector\lib\index.js`）：
   - `publish()`：`if (this.closed) return;`（安全）
   - `setState()`：`if (this.closed) throw new Error("inspector: Host source is closed");`（抛错）
   - `observeCordisTree()`：订阅 `ctx.on("internal/plugin", schedule)` 与 `ctx.on("internal/status", schedule)`，
     `schedule` 经 `queueMicrotask` 调 `publisher.setState(CORDIS_TREE_TOPIC, snapshot)`（`index.js:2294/2322`）。
   → 只要 source 关闭后还有任意一次插件/状态事件，就必然抛未捕获异常。
5. 该签名历史上唯一一次：今天这次；10-22、10-25 的 5 份 `crash-*-host.log` 中均无此串。
6. 桌面安装版本：`dsh-model-switch@0.4.42`（`profiles/desktop/node_modules/dsh-model-switch/package.json`），
   其 `lib/` 无 `prime-memory-compat.js`、无 `review-timeout.js`。
7. 桌面 bundle 里 inspector 由 `@deepseek-ai/dsh-experimental-inspector-profile` 启用，与本插件无关。

## 触发链（可复述）

供应商（官方 deepseek-account）连续超时 → host 侧套接字/worker 被拖垮（`write ECONNABORTED`）→
inspector 的 host source 关闭 → 之后任意一次 cordis `internal/plugin|internal/status` 事件 →
`setState` 抛 `Host source is closed` → 未捕获 → host exit 1 → 桌面重启。

用户点「去聊天里说」在时间上紧邻，但它是本插件 `discussPlan()` → 取消当前 turn，
只改 turn 状态，不产生 cordis 插件/状态事件；栈里也没有本插件帧。因此判定为**时序相邻、非致因**。

## 建议

1. **本插件**：升级到 0.4.52（与本次崩溃无因果关系，但包含 0.4.50 配置化审查超时、0.4.51 幂等加固、
   0.4.52 churn 根因修复共 10 个版本，桌面仍停在 0.4.42）。
2. **上游**：`HostBridgePublisher.setState` 应与 `publish` 一致地静默返回；或 `observeCordisTree`
   的 listener 包一层 try/catch。报告附上本文件的第 4 节代码行号。
3. **临时规避（用户决定）**：若不想再遇到重启，可在桌面 bundle 中移除
   `@deepseek-ai/dsh-experimental-inspector-profile`（代价是失去开发者工具页）；
   或修复出问题的 provider（把 `api.deepseek.com` 那条 listing 失败抑制掉）。
4. **未关闭的缺口**：lab 里未能复现（需 inspector bundle + 人为制造 worker 套接字中断）。
   若要完全闭环，可在 lab 装入 `dsh-experimental-inspector-profile` 后用代理切断 worker 连接复现。
