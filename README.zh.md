# Model Switch

[English](README.md) | 中文

在 DeepSeek Harness 中为当前会话、Subagent、Web Search、图像生成、Plan 执行和自动会话命名配置明确路由。Model Switch 只使用 DSH 公开服务和 Provider 自有 Adapter；不修改 DSH Core，也不管理 Provider 登录凭证。

<p align="center"><img src="docs/screenshots/composer-picker.png" alt="包含 Model、Effort、Context 和 Fast 的 Composer Picker" width="314"></p>

Picker 在切换页面或关闭搜索时保留键盘焦点，不覆盖搜索框的自动聚焦。从摘要页按 Escape 会关闭 Picker，并将焦点还给触发按钮。

## 路由

| 路由 | 行为 |
| --- | --- |
| 会话模型 | 当前对话的 provider/model/effort，只由 Composer Picker 或 Plan Review 修改。部署默认模型（新建会话）归 DSH 自己管理；选择器从不写它。 |
| Subagent | 子代理 spawn 未指定 provider/model/effort 时：使用委派会话自身推导出的路由——其供应商组的子代理对，其次是固定卡片的对；两者都没有则为官方继承（先父请求实时路由，再创建时快照）。显式指定路由的 spawn 永远不会被覆盖；Workflow 显式覆盖始终优先。 |
| Composer Picker | 只修改当前会话，并提交 catalog 中的原始 model id。 |
| Plan Review | 在发送 Plan 审核确认前，先提交执行模型。 |
| Web Search | 保留官方 `web_search`；部署显式启用后，通过 Provider 动态声明的独立搜索适配器路由。 |
| 图像生成 | 提供一个稳定的 `generate_image` 工具，通过选定的 Codex 或 Grok Adapter 路由。 |

无效、不可用或不受支持的路由会明确失败。Model Switch 不会静默换到另一个 provider 或模型。

空闲的空白会话可以选择 External Agent。提交中、等待首个 turn 以及运行期间，从请求开始就锁定所选执行运行时，不等待首 token 或原生绑定：Antigravity 保留其模型和 effort 选择；DSH 保留 LLM provider 选择，但禁用 Agent provider。会话一旦有过用户消息，Composer 和 Plan Review 仍显示 Agent 角色行但将其禁用，除非该会话已经绑定原生运行时。当前会话成功打开 Antigravity 原生会话后，Picker 会在该会话内禁用其他 provider，同时保留 Antigravity 模型与 effort 控件。DSH 全局 Picker 锁仍拥有最高优先级。

## 配置 Subagent 与能力路由

打开 **设置 → Model Switch**。设置页共有六张路由卡片——Subagent、Web 搜索、图像生成、自动审查、压缩、会话命名——外加「供应商配置组」卡片。子代理可以使用委派会话推导出的路由，也可以使用固定的 provider、model 和 effort。

自 0.4.23 起本插件不再配置、也不再保护部署默认模型（原「主模型」卡片）。默认模型归 DSH 自己：Host 会把最后一次会话切换写成默认值（包括经本插件选择器或 TUI 的切换），与原生切换行为一致——新会话从"上次用过的模型"开始。需要固定默认值时，请使用 DSH 自带的 **设置 → 模型** 页面。官方 DSH 在非本机浏览器将 ConfigForms 设为仅内存模式，设置页会明确显示不可用；请在 Host 的 127.0.0.1 页面打开设置。移除主卡片的附带收益：模型切换从此不再依赖设置可写状态（此前选择器要等 Main 表单可写才允许切换）。

切换固定 Subagent 的 provider/model 时，会用目标模型的默认 effort 替换旧模型的 effort；目标模型不支持推理时不传 effort。

![Model Switch 设置中的固定 Subagent 路由](docs/screenshots/settings-subagent.png)

官方继承先读取当前父请求，再读取 Host 自身的会话默认模型。推导或固定的路由会在官方 Subagent descriptor 创建前注入，且仅当 spawn 未指定 provider、model 或 effort——显式指定路由的 spawn 永远不会被覆盖，能力不是 `agentOptions` 的 provider（例如一次性进程适配器）也不会被重新解释为可路由的 Agent。DSH 0.1.2-alpha.4 会在该 descriptor 中携带 provider、model 和固定 reasoning effort。

### 保存设置

每一行的保存都是**一次**原子的、带版本围栏的官方 ConfigForm `mutate`：写入被拒绝时要么整行生效、要么什么都不写，不会再留下只写了一半的 provider/model 对。你编辑中的草稿不会被外部快照更新（另一标签页的保存、能力轮询）覆盖；版本冲突会明确报告并提供重新加载路径，而不是悄悄丢掉任何一方；30 秒内始终没有落定的写入会明确报错，而不是让页面卡在「保存中…」。值旁边的 ⚠ 标记现在只有一个含义：该值不在当前 Provider 目录中。

## 自定义模型如何出现在 Picker

Model Switch 不会把自身设置中任意填写的字符串变成模型。Provider 插件必须先把模型发布到 DSH 官方 Model Catalog：

```text
Provider 配置
→ Provider 将模型行发布到 DSH Catalog
→ 当前会话 Model Directory 提供 provider/model 元数据
→ Model Switch 对 Catalog 行分组
→ Picker 提交原始 provider id 和 model id
```

Catalog 提供 provider 名称、model id/name、reasoning efforts 和 default effort。已经保存但不再出现在 Catalog 中的路由，会在 Settings 中显示为 unavailable；Picker 不会假装它仍可路由。

### 变体 id 规则

Model Switch 按 provider，以及剥离以下后缀后的 model id 对 Catalog 行分组：

| Catalog model id | Picker 变体 |
| --- | --- |
| `acme-v1` | 标准模型 |
| `acme-v1-fast` | Fast |
| `acme-v1-128k` | Context 128K |
| `acme-v1-1m` | Context 1M |
| `acme-v1-1m-fast` | Context 1M + Fast |

规则：

- `-fast` 生成 Fast 轴。
- `-<n>k` 和 `-<n>m` 生成 Context 档位；可以与 `-fast` 按任意顺序组合。
- `reasoning.efforts` 生成 Effort 选项；`reasoning.defaultEffort` 是初始值。
- 切换 Fast、Context 或 Thinking 变体时，只有目标 Catalog 行支持当前 effort 才会保留；否则改用目标行的默认 effort，目标没有默认值时不传 effort。
- Catalog 中存在 reasoning 元数据时，该模型行具备 Thinking 能力。
- 无法识别的 id 不会被丢弃，而是作为独立 model family 显示。

组合选择必须由 Provider 发布组合行。只有 `acme-v1-fast` 和 `acme-v1-1m` 不能表示 Fast + 1M；还必须发布 `acme-v1-1m-fast`。Picker 永远不会合成 Provider 没有发布的 model id。

## Plan Review

Plan Review 拥有独立于会话当前路由的执行模型草稿。**确认执行**会先把该模型提交到当前会话，再回答待处理的 Plan 审核。提交被拒绝时，审核保持待处理并允许重试。**拒绝**和**去聊天里说**不会执行 Plan。

**拒绝**会发送提问方给出的选项，并把卡片反馈框里的文字作为答复自身的 `custom` 文本一并提交 —— plan 模式会把它作为"继续规划"的理由回报给模型，所以打回时可以带上要改什么。**去聊天里说**会撤下这张卡、把输入框还给你，用你自己的话说明；它在 Host 提供 `dismiss()` 时用它，在旧代际用 `cancel()`，两者都没有时明确指出这一点。审核一旦落定，**确认执行**与**拒绝**关闭，而**去聊天里说**与"重新加载"始终可达，卡片不会变成死路。失败会保留线上错误码（如 `session/writer-held: …`），而不是只给一句本地化文案。

**设置为目标并执行** 会先把这份 Plan 设为当前会话的 goal、再答复，于是 `dsh-goal-round-driver` 能在退出计划模式后继续推进。它调用已发布的 `remote.goals.create`；若已存在一个未完成的 goal，会先 `clear` 再 `create`，让新 Plan 拿到完整轮次预算，并在替换后提示。目标设置被拒时审核保持待处理、错误带真实错误码（如 `GOAL_AGENT_NOT_LIVE: …`）；部署未挂 goal 服务时该按钮禁用并给出原因，其余三个动作照常可用。objective 取计划全文（trim 后）：goal 域不设长度上限，但它会作为模型可见上下文出现在每一轮续跑里，所以计划很长时每轮都花 token。

卡片正文只显示计划的首行标题与首段摘要，**完整计划**会由官方 ui-plan 自动开到右侧侧边栏（头部的"查看完整计划"可随时再开）。接管的 composer 条目无权渲染官方的 `conversation.plan-review.actions` 槽位（每个子槽只允许一个声明者），因此卡片直接驱动 ui-plan 已注册的 opener——计划文档的地址与参数始终由 ui-plan 自己构造（见 `docs/seam-gap.md`）。

![带执行模型 Picker 的 Plan Review](docs/screenshots/plan-review.png)

## 自动审查模型（Auto review）

官方 `@deepseek-ai/dsh-experimental-auto-review`（Auto 权限预设的逐调用审查）把审查请求固定在会话自身的路由上。本插件通过 `cordis.patch.yml` 的行替换接管这一行：官方行被禁用，改挂 `dsh-model-switch/auto-review`，它在作用域子上下文里运行**同一份官方 `apply`**，把 `llm.stream` 的 `provider/model` 改写为该会话解析出的审查模型（供应商配置组 → 全局审查卡片 → 会话自身模型）。在 `official.apply(scope)` 之后，本行立即在同一作用域注册 `{ prepend: true }` 的 `tools/pre-execute` 监听器（在 Cordis 瀑布流中排在官方监听器之前），用 `AsyncLocalStorage` 将 `exec.agent.session` 绑定到审查调用链上，因此不同供应商的多个会话并行时互不干扰，会话中途切换供应商也会在下一次审查立即生效。设置页「自动审查模型」默认关闭 = 审查跟随当前会话模型；打开时以目录首位模型作为可再改的固定起点，保存后对下一次审查立即生效。审查未配置官方能力包（`@deepseek-ai/dsh-experimental-auto-review` 未随 profile 启动）时本行不挂载，Auto 预设保持官方的关闭状态。

0.4.31 起本行还在运行时接管这条缝，而不仅靠补丁文件：插件管理器会把组件开关写进"在所有 bundle 层之后生效"的层，手动把官方「自动审查」组件重新打开曾会让无防护的官方 gate 回来——而 `permissionPresets.registerAuto` 是单注册的，同一条缝上的两行最终杀掉每个工具调用。现在本行按接管会话命名槽位的同一手法接管：官方行将要 apply 时**先同步交出** Auto 注册（让官方行干净应用而不是撞车），再通过公开的 `Entry.update` 停用官方行，并以有界重试收回注册——整个位移过程保留会话的 Auto 选择。因此在插件管理器里把官方组件再打开只是一次会记日志、自愈的空操作；设置页「自动审查」卡片里也写明了这一点。

## 压缩模型（Compaction model）

官方压缩——`/compact` 与 DSH 的自动压缩——默认使用会话当前的目标模型做摘要。「压缩模型」卡片（默认关闭）改为固定摘要路由：打开时以目录首位模型作为可再改的固定起点，保存后对下一次压缩立即生效。两个字段都留空即回到官方默认。保存时若恰有压缩进行中，可能被打断并在下次重试。

每次摘要调用（`options.purpose === 'compaction'`）同样通过 `compactionScope` 按会话实时解析路由：该会话供应商组的压缩对 → 全局压缩卡片对 → 官方行的 `modelPolicies` / 会话目标模型默认。当解析出按会话路由时，子上下文的 `llm` 包装器在调用 `ctx.llm.stream(options)` 前原地更新 `options.provider` 与 `options.model`，从而让官方 `summarizeWithLlm` 返回并持久记录到 `compaction/summary` 的模型对与实际写摘要的模型完全一致。同时，profile 的 `compaction-basic` 行配置里的精确目标 `modelPolicies` 数组仍原样转发：

```yaml
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    modelPolicies:
      - provider: deepseek
        model: deepseek-chat
        summarizationProvider: deepseek
        summarizationModel: deepseek-reasoner
```

路由如何到达压缩引擎取决于部署在哪一层组合 agent。Web 面把压缩放进每个 Agent 预设的隔离 `compaction` 组里，而 profile patch 无法寻址 preset `plugins` 列表内部的行——因此 Host 在启动时桥接那一行（`src/preset-sync.ts`）：禁用该组的官方 `compaction-basic`，并在其后插入 `model-switch-compaction`，由它在 `compactionScope` 下挂载**同一份官方 `BasicCompactionEngine`**。其余预设行一律保持安装版 DSH（或部署在 Web 编辑器里保存的版本）的原样；插件不再随包携带预设副本，所以 DSH 改预设无需再同步副本，部署自己的预设修改也不会被覆盖。进程级组合 agent 的面（如 TUI）则走顶层行替换。

已知问题（上游侧，见 `docs/seam-gap.md`）：当工作集持续超过官方引擎的压力阈值时，自动压缩可能每步触发，并反复重试摘要过不了官方「摘要必须更小」守卫的小片段——表现为"不停自动压缩"，本插件不控制该行为（已在同一会话做过插件开/关 A/B 对照）。可用的缓解（都在转发行配置上）：`auto: false`（保留 `/compact`）、调高 `thresholdRatio`、减少挂载的工具 schema，或固定一个摘要更精炼的压缩模型。

## 会话命名模型（Session naming model）

DSH 会自动为新会话起名；命名的触发节奏由 profile 的官方命名行决定（首条提示后一次，或每条提示一次）。「会话命名模型」卡片选择这些命名请求使用的模型。**关闭——两个字段都留空——即官方行为：命名跟随会话自身的模型。** 打开时以目录首位模型作为可再改的固定起点。

路由在**每次命名请求时现读**：保存后对下一次起名立即生效、无需重启，且进行中的命名请求不会被保存打断。每次请求按顺序解析路由：该会话供应商组里的命名对，其次卡片的部署级对，其次会话自身的模型。请求经由官方命名实现发出，它会把实际使用的 provider/model 记录到该会话自己的 `session/title-llm-request` 事件里，因此持久记录与真实请求永远一致。本插件替换官方的 `session-title-llm` 行而不分叉命名逻辑（该接缝每个上下文只允许注册一个命名 provider），并镜像该行声明的节奏；profile 没有官方命名行时保持 DSH 的确定性兜底标题。

0.4.29 起与实验包「随对话更新的标题」（`dsh-experimental-session-titles-bundle`，插入 all-prompts 命名行）兼容：启用该实验包时，本插件接管同一个命名 provider 槽位并镜像 all-prompts 节奏，标题随对话更新，同时命名模型路由与供应商组路由继续生效（`session/title` 记录中的 provider id 为 `session-title-all-prompts-llm`，与官方行一致）；禁用实验包即回到首条提示节奏与同样的路由覆写。实现只使用 loader 已发布的缝（`loader/patch-context` 瀑布、`Entry.update`、`sessionTitle.register` 及其 disposer），让官方行先成功注册、再被停用并由本行重占槽位，因此启用时不再出现 `already registered` 激活失败弹窗。

0.4.30 起 Auto 审查行还能在许可服务降级时保住工具调用：DSH 的 Auto gate 在每次工具调用前读取 `permissionPresets.current(session)`，一旦该服务失活，这次读取会在 gate 自己的审查错误包装之外抛出 `cannot get required service "sessionProjections" in inactive context`，导致每个工具调用都在执行前失败。本行在审查作用域内遮蔽该服务：探测失败即按「不在 Auto」处理，工具调用照常执行，并只记一行日志说明审查被跳过。0.4.31 起该遮蔽**常开**且按调用惰性解析服务（服务尚未激活时也受保护），并把失败的解析链（每级 fiber 的 `uid/state/name/inject`）记进唯一那行降级日志——因为上游成因是 loader 生命周期窗口：`internal/get` 会沿调用方 fiber 链整链查找，而有 24 个已发布行在 `inject` 里声明了 `sessionProjections`，其中任何一行处于重载中都可能打断无防护的探测（连同上游建议一并记录在 `docs/seam-gap.md`）。Auto 注册本身改为**托管**：位移时同步交出、事后收回而不卸载 gate（卸载会把在用 `auto` 的会话翻成 `danger-full-access`）；配置重载后重新挂载的 gate 会先卸载上一个注册，因此 `auto` 预设不会再从许可选择器里消失。


## 供应商配置组（Provider groups）

「供应商配置组」卡片为每个供应商保存一组路由——压缩、自动审查、会话命名与子代理四条路由一起存；为供应商 X 保存的组，作用于自身供应商就是 X 的会话。组是**推导出来的，而不是写进去的**：切换某个会话的供应商不写任何东西，因此不同供应商上的多个会话并行时再也不会互相覆盖、互相改写对方的辅助路由。

每次请求都从持久状态推导自己的路由：先取该会话的供应商（它的模型选择——刚做出、尚未被请求消费的 pending 选择优先——其次最近一次已记录的请求路由），再取该供应商的组对，再取部署级的平铺对，最后是官方默认（压缩用会话目标模型；自动审查与命名用会话自身模型；子代理用官方继承，且平铺卡片仅在 `fixed` 模式下生效）。因为什么都不写，本浏览器从未打开过的会话、以及来自 TUI 或其他客户端的切换同样生效——没有 watcher，也没有剩余边界；观察不到供应商的会话直接落到部署默认。会话中途切换供应商后，下一次压缩、自动审查、命名或子代理调用都会立即跟随新供应商的配置组。编辑器里首次配置某供应商时，草稿从当前生效的路由种子化；每行的关闭态表示"不固定——先落到卡片、再落到官方默认"；「删除该组」彻底移除该供应商的条目（删掉最后一组时同时清掉存储字段）。

## Model Switch 不会改变什么

- `web_fetch` 及其配置的 provider
- Vision 路由、`read_image` 和普通聊天附件
- Provider 登录、凭证或 Provider 设置卡
- 官方 Agent Presets
- 已有的 Provider 专属图像工具
- 部署默认模型本身（DSH 自己把最后一次会话切换写成默认值，与原生 TUI 切换一致）
- 全局压缩策略、命名节奏（只可配置命名模型）或 DSH Core

## 安装

Model Switch 交付的是预构建代码，安装不需要任何构建授权。从 npm 注册表安装：

```sh
dsh plugin --profile web add --force dsh-model-switch
```

打包好的 tarball 可以在不走注册表的情况下安装同一份构建：

```sh
dsh plugin --profile web add --force ./dsh-model-switch-0.4.17.tgz
```

然后只安装实际使用的 Provider Adapter。此版本已在官方 DeepSeek Harness `0.1.7-rc.2` 上检查，并在 `0.2.0-rc.2` 上验证：

```sh
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/latest/download/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-codex/releases/latest/download/dsh-llm-codex-0.3.23.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-grok/releases/latest/download/dsh-llm-grok-0.3.19.tgz
```

### 搜索供应商统一接入（0.4.7）

搜索列表来自 Host 上已有的 `ModelSwitchAdapterRegistry`，Provider 自声明名称和独立搜索模型；浏览器只收到普通元数据，不收到凭据或可执行函数。注册、卸载会通知订阅者；原地修改模型声明最迟由 20 秒心跳更新。`ProviderDirectory` 继续负责客户端 role/usage，不另造注册表。 已发布 0.2.8 的 `sortCatalogGroups` 只排序硬编码 LLM 路由；Model Switch 自行按实时 `catalogRoutes` 排序，因此 Owner 公布 Agent catalog id 时会跟随已保存的卡片顺序。原生 `catalogId` / `unknown` 账户样式仍需要比已发布 0.2.8 更新的 Owner。模型原生联网不等于独立 `web_search` 适配器。

DeepSeek 薄适配器调用官方公开 `DeepSeekSearchProvider`，复用用户的 `web-search-deepseek` 设置和公开凭据服务；Codex 复用 ChatGPT 登录，Grok 复用已有订阅凭据。缺凭据、配置错误、模型不支持均明确失败，不静默切换。

**注册不等于选中全局路由。** 安装插件不再覆盖 Web 配置。部署时先用 `dsh --profile web --dump-config` 查看完整 Web 配置，只把 `searchProvider` 改为 `model-switch`，其余字段原样保留。注意 id 定位的 patch 会整体替换 `config`，不会深度合并；不能只写 searchProvider，也不能把自定义 fetchProvider 写死成 http。

然后在 Model Switch 设置中选择请求的供应商/模型。全局已选 Model Switch、但没有完整且受支持的搜索配置时，官方选择层返回 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`，不会回退 DeepSeek。全局未选 Model Switch 时，下拉框不控制官方搜索；未固定全局供应商且有多个可用 provider 时会明确报歧义。卸载前应恢复部署原来的搜索路由。官方 `web_search`、`web_fetch` 均不替换。

本轮分支、测试命令及 3082 live 证据见 [搜索接入审计](docs/search-provider-audit.md)。经授权复用生产 DeepSeek 凭据后，Flash/Pro 的 3082 真实搜索均通过，三家均已有成功证据。Picker 测试夹具及审查发现的元数据恢复问题已修正，保留 v0.4.6 兼容性后全量 172 个测试通过。生产推广仍须先在 lab 安装验收同一组不可变发布产物。

如果 profile 已安装 `dsh-composer-picker`，请先移除它。Model Switch 已经拥有 Composer Picker 和 Plan Review 席位；同时安装会产生重复或竞争 UI。

生产 profile 必须使用已发布的注册表版本或 GitHub tag，不能使用工作区本地依赖。安装或修改路由后重启对应的 DSH profile。**安装、更新、启用或禁用本插件后都要重启一次**：它持有 Host 侧的行，并在运行时接管官方的自动审查行（`permissionPresets.registerAuto` 只有一个注册位）；不重启直接热启用时，官方行可能仍在服务，接管只能先把审查路径屏蔽掉——工具照常运行、本次审查跳过并留一条日志——重启后才会真正收敛。

## 兼容性

DSH Host peer 和开发依赖接受 `>=0.1.7-alpha.2`，包括 rc.1 和后续版本。开发锁文件解析到 rc.2。Cordis 接受 `>=4.0.4 <5.0.0`。

已验证版本：`0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.2`、`0.2.1-rc.2`。0.2.0 的声明覆盖三处差异：Host 改名的提问撤下动词（`cancel()` → `dismiss()`）、`session.selectModel` 不 await 的部署默认值写入、以返回值报出的 `ModelDirectory.select` 拒绝；三者均已在 lab（3082/3085）与真实桌面会话中逐一验证。0.2.1 的声明覆盖两处被替换的 seam：共享命名调用改为 provider 自备提示词与解析的 `executeSessionTitleLlm`（本插件按安装行在运行时适配，并镜像官方 0.2.1 的提示词、取最低 reasoning effort 与 `currentTitle` 锚定）；Subagent 运行时以 `startActivation` 取代 `start()`/`startContinuable()`，本插件同时识别两条已发布线，并为激活入口覆写 `spec.request.agentOptions`（显式路由仍优先、非 agentOptions 能力的外部适配器不改写），路由语义与旧线一致（0.4.28，记录于 `docs/seam-gap.md`）；0.2.1 还新增了自动审查门禁对 `ctx.workingDirectory` 的读取，旧实现因在自己的 fiber 里直调 `official.apply` 而需要手工镜像门禁的 `inject`，于是每个工具调用都被拒（`cannot get property "workingDirectory" without inject`），0.4.28 改为把官方门禁以插件方式挂载、由官方 `inject` 解析依赖，本行只声明自身需要的服务。0.4.28 的真实包证据：0.2.1 上旧形态精确复现该注入错误、新形态到达 `workingDirectory.ensure` 且成功注册门禁、激活入口的路由改写与 spec 透传通过；0.2.0 上无需 `workingDirectory` 服务即可注册门禁，`start()` 路由改写与父身份保持不变。0.2.1 的 lab 证据为：npm 安装的 0.2.1 运行时 + 打包后的 0.4.26 组合 `exit 0`、命名/压缩/自动审查/子代理四行均来自本插件、Web Host 在 3082 启动并服务需要鉴权的页面；该次未经浏览器调用 3082 能力 RPC，真实桌面的 0.2.1 命名差分在应用升级后复验。0.2.1 还暴露出一处预设层面的差异（0.2.1 校验提示词变量、只有 `provider`/`model`，且把 `time-context`/`tool-schedule` 移进预设）：0.4.26 的静态预设副本因此让每一轮都报 `unknown prompt variable "{{cwd}}"`，0.4.27 删除副本改为启动期运行时桥接，并在 lab 的 0.2.1 headless 真实回合中验证通过（展开见 CHANGELOG 0.4.27）。

`package.json#dsh.compatibility.dshReleases` 中的已验证版本是证据，不是允许列表。新增验证声明前要审查公开 API 变化并测试新 Host 版本。

## 开发

需要 Node 22.19+ 和 pnpm。

```sh
pnpm install
pnpm run check
```

`check` 会构建 Host/Client artifacts，运行单元测试和 Cordis/Settings 组合测试，检查提取后的发布包，并验证 bundle 可复现。产品范围见 [PRODUCT.md](PRODUCT.md)，实现约束见 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。

## 正式版安装（Latest）

本版在官方 DeepSeek Harness `0.1.7-rc.2` 与 `0.2.0-rc.2` 上验证了 Main、子代理、Composer、Plan Review 与能力路由；发布包只包含构建后的 Host/Client 产物，不包含兄弟仓库源码或本机路径。

Latest 安装命令（资产文件名必须与当前 latest Release 一致）：

~~~sh
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/latest/download/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-model-switch/releases/latest/download/dsh-model-switch-0.4.16.tgz
~~~

固定版本安装命令：

~~~sh
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/download/v0.2.14/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-model-switch/releases/download/v0.4.16/dsh-model-switch-0.4.16.tgz
~~~

更新、卸载与验证：

~~~sh
# 更新到最新 Release
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-llm-providers-ui/releases/latest/download/dsh-llm-providers-ui-0.2.14.tgz
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-model-switch/releases/latest/download/dsh-model-switch-0.4.16.tgz
# 验证加载与版本
dsh plugin --profile web list
# 只卸载本插件
dsh plugin --profile web remove dsh-model-switch
~~~

配置入口：Web 使用「设置」中的本插件页面；Host-only 插件使用 profile 的 dsh.profile.bundles 配置。先复制本 README 的最小 YAML/JSON 示例，再填写凭据或后端地址。

回滚：重新安装不可变的 v0.4.15 归档并恢复已记录的 profile；不需要降级 Host。失败时查看 journalctl --user -u dsh-web.service，不要将源码 checkout 链入生产 profile。

Release 与完整性：[v0.4.16](https://github.com/NOirBRight/dsh-model-switch/releases/tag/v0.4.16) · [SHA256](https://github.com/NOirBRight/dsh-model-switch/releases/download/v0.4.16/dsh-model-switch-0.4.16.tgz.sha256)。
