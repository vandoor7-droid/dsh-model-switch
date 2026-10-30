## v0.4.55

声明兼容 DSH `0.2.1-rc.5`（该版本进入 `dsh.compatibility.dshReleases`，运行时下限仍是 `>=0.2.0-rc.2`，不设上界）。

**在 rc.5 上实测通过的（virtual / 零真实额度，lab `D:\dsh-lab` 端口 3082，headless Edge over CDP）**

- 设置页渲染，含「模型切换」分组；模型选择器切换（`gpt-6.1-sol` ↔ `MiMo-V2.6-Flash`）。
- 「记忆蒸馏模型」卡片（0.4.54 恢复）显示 `apigoto · probe-memory` 与新文案。
- 「审查豁免」卡片：已开启、名单内 58 条，与 `tools` RPC 的 `recommended: 58` 一致。
- automode 行被适配层识别：`{installed: true, route: "apigoto/mimo-v2.6-flash", added: 53, skipped: 2}`。
- 「自动审查」预设下写操作**确实被审查**，审查请求走本插件配置的路由：
  `gpt-6.1-sol(tool=write)` → `mimo-v2.6-flash` → `gpt-6.1-sol`（记录器 `probe-ui-rv5.jsonl`）。

**静态契约核对**

- rc.5 的 `dsh-client-ui-user-questions` 用与本插件**逐条相同**的谓词判定计划审核
  （单问题 / `intent.kind === "plan-review"` / 有 detail / 非多选 / 选项 ≤ 2），宿主也正是用同一
  辅助函数产出该 kind，所以计划审核卡的数据面在本插件侧无需改动。

**如实记录的未验项与异常**

- 计划审核卡的**运行时渲染**未在 lab 复现：`exit_plan_mode` 要求会话处于 plan 模式，而
  `planMode` 是预设级 isolate；lab profile 没有携带完整标准组成的预设，工具会先抛错，插件把
  计划渲染为文档卡。桌面 profile 的 `preset-YiXuan` 具备该组成，可另行确认。
- rc.5 上本插件自己的审查计数不随决策递增（`allowedCalls` / `skippedReadOnly` 恒为 0），
  即使审查请求确实发生、纯读也确实被跳过；路由生效，计数仅为展示层偏差，已记录待查。

## v0.4.54

记忆蒸馏路由**做通了并重新上线**（此前因未证实而撤卡）。

- **根因（lab 实测定位）**：`dsh-prime-memory` 的 `effectiveCfg` 只要 `cfg.llm.provider+model` 非空就视为 pinned，**同时忽略运行时链与 `distillProvider/distillModel` 对**。本插件早期写入的静态 pin 因此一直压过后续所有 live 写入——表现为「卡片改了、实际调用没变」。
- **修复**：①live 推送被确认成功后，主动删除自己写过的 `llm:` 块（`clearStaticPin`），让 live 对真正生效；②静态 pin 不再抢先写入，改为 **live 尝试耗尽后**的最后手段（`pinAsFallback`，4 次重试后）。
- **证据（virtual / 零真实额度，记录器 `D:\dsh-artifacts\probe-hot.jsonl`）**：删 pin 后启动不再回写 pin；把本插件的记忆路由改成 `apigoto/gpt-6.1-sol` 重启 → 插件日志 `蒸馏模型路由: apigoto/gpt-6.1-sol`；`rebuild-start` 对 6 条合成 L0 触发真实蒸馏 → 探针记录 `gpt-6.1-sol: 3`、插件日志 `LLM 调用 apigoto/gpt-6.1-sol`。
- **卡恢复**：`MEMORY_CAPABILITY_UI = true`，「记忆蒸馏模型」卡片与分组行重新上线；文案改为「反复重试仍写不进去时才回落静态路由」。
- **已知限制（如实记录）**：新的路由要等本插件该行重跑才会被推送（重启，或经我们设置服务的改动）；`dsh-prime-memory` 自身 `engines.dsh` 只声明到 `0.2.1-rc.4`，在 rc.5 上宿主会跳过该 bundle，与本插件无关。
- **新增测试**：`tests/prime-memory-pin.spec.ts` 3 例（写入 → 清除 → 幂等清除 / 无该行 / 文档缺失）。

## v0.4.53

「自动审查模型」与「审查超时」两项设置改为**热生效**，不再需要重启 DSH。

- **机制**：用 Cordis 已发布的 `Fiber.update(config, noSave)`（`cordis/lib/types/fiber.d.ts:187-199`：校验→`internal/update` 瀑布→重挂该行，`noSave` 提示不写回持久化）把新配置推给正在运行的行。新增 `src/fiber-hot-update.ts`：只对 `ACTIVE` 的 fiber 动作，返回 `updated` / `no-fiber` / `not-active` / `failed`，异常全部包住，自身不持久化任何东西。
- **automode 分类器路由**：设置变化且路由相对上次写入发生变化时才重挂。必须走重挂——该行的 `apply(ctx, rawConfig)` 用 zod `Config()` 解析出闭包副本，只替换 `entry.options.config` 触达不到运行中的实例。**副作用**：重挂会清空该行的判定缓存与每会话断路器计数。
- **审查超时**：文档写入成功后重挂 `llm-pi-ai` 行使新值立即生效；文档仍是持久副本，重挂不可用（无活实例 / 校验失败 / 被瀑布否决）时回落到下次启动，状态里标注 `restart-required`。**副作用**：重挂会中断该 provider 的在途调用，因此只在值真正变化时触发。
- **状态面**：capabilities RPC 的 `status` 新增 `automode.hot/hotReason` 与 `reviewTimeout{configuredMs,applied,hotApplied,hot,hotReason}`；设置页文案改为“立即生效 + 副作用 + 回落说明”。
- **lab 证据（virtual / 零真实额度，`D:\dsh-lab`）**：编辑 profile 触发 loader volatile-update 后**未重启**——automode 路由 `probe/gpt-6-luna` → `probe/deepseek-flash` 且 `hot: applied`；`autoReviewTimeoutMs` 设为 5 → 文档写入 `streamIdleTimeoutMs: 5`、`hotApplied: ["probe"]`、`hot: applied`；随后 30 秒 profile 哈希稳定（无重挂循环），profile 里没有 `classifier`（内存态未持久化）。
- **未验证（如实记录）**：热生效之后「下一次审查请求确实使用新路由/新超时」的请求级行为没有单独取证；重挂被上游否决时的回落只有单测覆盖。

## v0.4.52

修复一个自维持的 recompose 循环（lab 实测定位，DSH 0.2.1-rc.3 + dsh-prime-memory 0.26.10）：

- **根因**：记忆蒸馏适配层的幂等守卫把 `forms.describe()` 返回的值当 live 段顶层读，而该值是整行配置（`{ llm, live }`）→ 守卫永不命中 → 每次激活都向 memory 的 settings-set RPC 重推路由；memory 插件每次 set 都会把 live 段重新落盘（键序与上一次不同）→ profile 文档变化触发 recompose → 适配层再次激活 → 再次重推。表现为 profile 文档 mtime 约每 5-6 秒一跳、automode 的 `boot` 决策记录约 1.5 条/秒，宿主进程并不重启。
- **修复**：`memoryLiveMatchesRoute` 同时接受 live 段与整行两种形态（嵌套时取 `live`）；命中即跳过推送。新增嵌套形态单测。
- **证据**：修复前 40 秒窗口 3 次内容变化，相邻快照 diff 仅为 `mdExportMaxRecords` 键序位移（内容相同）；修复后 40 秒窗口 **1 次**变化（首启创建 memory 行），之后稳定。二分另确认：移除本插件后 30 秒 0 跳。

## v0.4.51

两处幂等加固，消除对 profile 文档的冗余写入：

- 记忆蒸馏适配层在推送前先比对 live 配置：路由、空链与三层分层链都已一致时**不再推送**（`memoryLiveMatchesRoute`，5 个新单测）。此前每次激活都无条件推送，而 memory 插件的 settings-set 每次都会把 live 段落盘。
- auto-review 接管在 `loader/patch-context` 里对**组合期已禁用**的官方行不再执行 `Entry.update({disabled:true})`（启动扫描原本就有这个判断，监听器漏了）。

已知未决问题（如实记录，不宣称已修复）：lab 里启用可选 auto-review bundle + automode + memory 的组合曾观察到间歇性 recompose 抖动（automode 的 `boot` 决策记录 ~1.5 条/秒、profile 文档 mtime ~5-6 秒一跳）。二分显示：移除本插件后抖动消失（30 秒 0 跳）；加入上述两处加固后**同一构建两次测量不一致**（一次 30 秒 6 跳、一次 25 秒快照窗口 0 次改写），写入者未能 conclusively 定位。详见 `docs/route-verification.md` 的 recompose churn 小节。


## Unreleased

- **记忆蒸馏路由修复（已提交，未发版）**：`fix(memory): stop the pin and the live push from cancelling each other`（`8e59fda`）。适配层不再"推链 + 清空 legacy 对 + 写静态 pin"三者互相抵消：live RPC 被接受时只发 `distillChain: []` + `distillProvider`/`distillModel` + 分层链，静态 pin 降级为 RPC 不可用时的兜底。`src/`、`lib/` 与测试（586 通过）已更新；**npm 上的 0.4.48 不含此修复**。
- **发版前置条件**：在隔离 lab（全虚拟探针）里证明 L1/L2/L3 的蒸馏调用确实带着配置路由、且改动即时生效；通过后才恢复「记忆蒸馏模型」卡片（`MEMORY_CAPABILITY_UI`）并随 v0.4.49 发布。未通过则保持撤卡。
- **其余待做**：DSH `0.2.1-rc.4` 运行时验证；Auto review 与 automode 分类器的虚拟取证；计划审阅卡两张截图（需 answerer）。

## v0.4.50

设置页新增「审查超时」：自动审查请求的流式空闲超时可自定义、可取消、可恢复默认。

- 作用点：写入审查模型所在 provider 的 `streamIdleTimeoutMs`（`@deepseek-ai/dsh-llm-pi-ai` 的 provider profile）。上游没有 per-request 覆盖，这是唯一入口。
- 「取消超时」写上游硬上限 `2147483647ms`（≈24.8 天）——上游拒绝 0/负数/Infinity，所以它 **不是真正的无限**；死端点会一直等待，UI 文案已如实标注。
- 作用范围：该 provider 的**全部调用**（审查、主对话、其他路由），不只是审查请求。
- 生效时机：写入发生在启动过程中，**下一次启动**才读取新值（实测写入当次仍按旧的 300 秒）；UI 已写明需重启一次。
- 恢复默认 = 删除该键（本插件是这条键的管理者）；实测删除后回到上游默认行为。

修复（本轮实测发现）：

- `model-switch-review-timeout` 行在激活期 `await` 设置写入会拖死加载器：headless profile 直接起不来，CLI 以 `unsettled top-level await` 退出（exit 13）。改为 fire-and-forget + 延迟重试 + 串行化。
- 清空超时字段改用 `unset` 而不是 `set null`：字段是数字，null 会被 host schema 拒绝。

lab 实测（virtual / 零真实额度；本地虚拟端点 `tools/route-probe.mjs`，DSH 0.2.1-rc.3）：

- 自定义 5 秒 + 探针挂起 8 秒 → 下次启动报 `TIMEOUT: pi-ai stream idle timeout after 5000ms`（写入当次仍成功，证明需重启）；
- 取消超时 → 键写为 `2147483647`，同样 8 秒挂起后正常完成；
- 恢复默认 → 键被删除，后续启动正常完成（回到 300 秒语义）。
- 复现方式：`node tools/route-probe.mjs --preset ok --hang 8000`（挂起 8 秒不回字节），配合上面三种设置重启各一次即可复跑。

## v0.4.48

兼容门限从「逐版本列举」改为「下界 + 区间」：

- **新增 `dsh.compatibility.dshRuntime: ">=0.2.0-rc.2"`**：凡 ≥ 该下界的 DSH 运行时都按已验证处理（不再逐个版本写白名单）；`blocklist` 仍最优先、加载仍 fail-open——区间只消除「未验证运行时」的警告噪音，不改变任何挂载行为。
- **实现**：`src/compatibility.ts` 新增 `compareDshVersions()`（含预发布排序：`rc.2 < rc.3 < 正式版`）与 `runtimeFloorOf()`（只认开区间 `>=x.y.z`，有界范围视为另一种承诺、忽略不半执行）；`allowDshRuntime()` 把区间透传给判定。
- **测试**：`tests/compatibility.spec.ts` 增 5 例（预发布排序、区间解析、≥下界不告警、低于下界仍告警、blocklist 仍拦截、清单里确有该键），11 例全绿。
- **工具**：`tools/route-probe.mjs` 随本版发布 `--map`（按模型分流回复）与 `once`（每模型只回放一次工具调用，避免自激循环）。
- **尚未取证**：DSH `0.2.1-rc.4` 的运行时验证仍待做（区间已覆盖其语义，但未单独实测，不据此声称已验收）；记忆蒸馏路由、Auto review 与 automode 分类器的虚拟实测同样待做。

## v0.4.47

两件用户可见修正（撤卡 + 计划卡换模型），均为热修。

- **设置页撤下「记忆蒸馏模型」卡片与供应商分组第五行**：该能力此前只有界面，路由未证实会改变 `dsh-prime-memory` 的实际蒸馏调用（见 `docs/route-verification.md` 的 memory 行与 `docs/prime-memory.md` 的负结果）。适配层 `src/prime-memory-compat.ts` 与 `memoryProvider` / `memoryModel` 设置字段**保留休眠**，等虚拟探针记录到 L1/L2/L3 命中配置路由后再恢复 UI（开关 `MEMORY_CAPABILITY_UI`）；分组说明文案同步收回到「压缩、自动审查、会话命名、子代理」四项。
- **计划审阅卡换模型后点「拒绝」/「讨论」，会话仍用旧模型**：卡片内的执行模型选择器只写草稿，唯一提交点原本只在「接受」路径。现在四个出口（接受 / 拒绝 / 讨论 / 作为目标执行）统一先提交草稿再执行 —— `commitThen()` 复用 `approvePlanReview` 的「未变更短路、提交被拒则不答复」；提交被拒时卡片保持打开并显示原因，不再静默回退旧模型。
- **测试**：计划卡新增 3 例（拒绝时提交、提交被拒保持打开且不答复、讨论前提交），`tests/picker/plan-review-card.spec.tsx` 32 例全绿；`pnpm run check` 全绿。
- **规则固化**：`AGENTS.md` 新增「Lab 验证：全程虚拟请求/虚拟答复，零真实额度」；`tools/route-probe.mjs` 增加 `--preset`（`classifier-allow` / `classifier-deny` / `title` / `memory` / `plan`）与 `--tool` 工具调用回放；每日巡检 prompt 同步该约束。
- **未在本次完成**（按计划随后续版本走）：记忆蒸馏路由落地与虚拟实测、DSH `0.2.1-rc.4` 的验证与声明、Auto review 与 automode 分类器的虚拟实测。

## v0.4.46

设置页「记忆蒸馏模型」的说明补上生效条件：**改完需重启一次 DSH**（该插件在启动时读取路由）。文案与实际行为对齐，避免再次出现"界面显示已改、实际调用没变"的误解。

## v0.4.45

「记忆蒸馏模型」现在真的会生效——方式是**改成静态路由并重启一次**，而不是运行时热切换。

- 适配层把按供应商分组解析出的蒸馏路由写进 `dsh-prime-memory` 行配置的 `llm.provider` / `llm.model`（源码里 `pinned` 优先级最高，`resolveModelRoute` 首先返回它），并在写前清掉旧的 `live.distillChain` 等运行时键，避免出现"界面显示 A、实际跑 B"。
- 同时仍通过插件自己的 `/dsh-memory/rpc/settings-set` 推全局链与三层分层链，让每次调用都重新解析路由的层立刻跟随。
- **生效时机**：路由属于配置，DSH **下次启动**时读取。lab 实测（DSH 0.2.1-rc.3 + `dsh-prime-memory@0.26.10`）：重启后 L1 抽取、L2 场景整合、L3 画像蒸馏三层全部调用 `apigoto/mimo-v2.6-flash` 并成功返回。

已知边界（实测记录）：

- 运行时改链（`live.distillChain`）经设置页、settings 服务、插件 RPC 三条写入通道，都只改显示不改实际调用——所以本版不再依赖它。
- 因此**切换供应商后蒸馏模型不会立刻变**，需要重启一次 DSH；这一点已写进设置页说明。

## v0.4.44

> **更正（2026-10-26，lab 实测后）**：本条目原称"记忆蒸馏的默认路由改为跟随本插件按供应商分组的配置"——**该条不成立**。在 DSH 0.2.1-rc.3 + `dsh-prime-memory@0.26.10` 上实测：改它的行配置无效（插件启动时已把配置读成快照）；改用宿主 `settings` 服务写 `config.live.distillChain` 虽然**写入成功且重启后仍在**，其蒸馏调用记录仍为 `apigoto/deepseek-flash`（部署默认模型）而非配置的 `mimo-v2.6-flash`——写入只改变它设置页的显示，不改变实际调用。因此该能力**不得按已实现宣传**；`src/prime-memory-compat.ts` 与设置页「记忆蒸馏模型」卡保留为未验证的实验路径。其余条目（本地探针工具、审阅卡窄窗修复、分组编辑器观感、v0.4.43 的会话标题槽位修复）均已实测生效。

「记忆蒸馏」成为第五个可配置能力：`dsh-prime-memory` 的蒸馏默认路由改为跟随本插件按供应商分组的配置，并新增一套本地探针，用来证明某条请求**实际**打到了哪个模型。

- **新能力「记忆蒸馏」（`memoryProvider` / `memoryModel`）**：与压缩/审查/命名/子代理并列，平面默认 + 每供应商组一行；因蒸馏是全局流水线、没有会话 provider，分组键取**部署默认供应商**（`agent-default-model.config.provider`），解析顺序 `组 → 平面 → 不注入`。设置页新增「记忆蒸馏模型」卡片，供应商组编辑器新增第五行。
- **适配层 `src/prime-memory-compat.ts`**：在内存里填充 `dsh-prime-memory` 行的 `config.llm.provider/model`（其 `resolveModelRoute` 的最高优先层），四段判定——用户显式设置则让位；本插件上次写的值可覆盖；本插件路由不完整则跳过；否则注入。不落盘、不写 `live.distillChain`，因此它自己的设置页仍显示「跟随默认模型」。挂载扫描 + `loader/patch-context` + `settings-update` 三时机一致生效。
- **行接线**：新增 loader 行 `model-switch-prime-memory-compat`（`inject: ['loader','modelSwitch']`）、tsdown 入口与 `package.json` 导出。**lab 首启曾因漏声明 `inject` 报 `cannot get property "modelSwitch" without inject`，已修并复验**。
- **用量探针 `tools/route-probe.mjs` + `tools/route-report.mjs`**：本地 OpenAI 兼容端点记录每次请求的 model/port/authPresent 到 JSONL；报告按 model×port 汇总，`--assert` 失败退非零。冒烟通过（POST 200 / 报告出表 / 断言 OK 与 MISSING 各一次）。
- **计划审阅卡窄窗截断**：`.actions` 改为可换行、按钮可收缩、主操作 `flex-shrink:0`，主操作不再被面板右缘裁掉。
- **分组编辑器观感**：`.rowCard:has(+ .formGrid)` 把能力头与其字段并成一张卡（下半圆角/边框拼接、字段区同底），字段可见时隐藏重复摘要行，五项之间留 14px 间距；文案统一为"五项（含记忆蒸馏）"。
- **测试**：新增 `tests/prime-memory-compat.spec.ts`（10 例：注入/让位/半对/自改/无路由/非对象/保留其它键 + `memoryRouteOf` 三级回落）；接管时序断言改为有界 `vi.waitFor`。`pnpm run check` 绿（62 文件 / **578** 测试 + pack 闸门）。
- **Lab 验证（DSH 0.2.1-rc.3，`DSH_HOME=~/.dsh-lab`，real apigoto 凭据从桌面 profile 导入）**：apigoto 可达（非 401/403；首次失败是 `UNSUPPORTED_REASONING_EFFORT`，去掉 effort 后正常）。已实测：主模型 `apigoto/deepseek-flash` 回复成功（3 秒）、会话命名走 `apigoto/mimo-v2.6-flash`（标题自动生成）、`memory.log` 出现 `蒸馏模型路由: apigoto/…` 证明适配层路由已到达该插件。**未逐一实测**：子代理 / 压缩 / 自动审查 / automode 分类器四条路径（仅单测覆盖），按项目规则这些路径不得对外宣称已验收。

## v0.4.43

修掉「同时启用本插件与『随对话更新的标题』时，添加模型供应商会失败」的冲突（`session-title provider "session-title-all-prompts-llm" is already registered`）。

- **根因（lab 复现 + 插桩取证）**：保存供应商会重写 profile 配置层并重建整个组合；官方 `optional-session-title-all-prompts`（由 `@deepseek-ai/dsh-experimental-session-titles-bundle` 插入）在重建时被**重新激活**，而本插件在 `loader/partial-dispose` 开始时**仍持有** `sessionTitle` 的单槽位注册，于是官方行自己的 `register()` 抛 `already registered`；一次激活失败会中止整个组合，保存因此失败。
- **插桩证据**：临时把 provider id 改成 `model-switch-…` 后，报错点名占用者是 `model-switch-session-title-all-prompts-llm`（本插件），排除"官方行自己重入"的猜测；再把 `loader/*` 事件落盘，确认保存时整树 `partial-dispose` 期间 `claimed=true`。
- **修复（`src/session-title.ts`）**：在**第一个** `loader/partial-dispose` 就 `yieldSlot()` 释放命名槽位；重建期间被重新插入的官方行因此能正常注册，本插件随后按既有接管流程（禁用该行 → 有界夺回）恢复可控命名路由。另加 `loader/entry-init` 让位与"无可接管行时补认领"两处兜底。
- **行为不变**：命名路由优先级（组 ?? 默认）、候选链、日志字段都不变；仅在组合拆除的短暂窗口内把槽位交还给官方行。
- **测试**：新增"官方行在同一次组合重建中激活时不得占位"回归用例；接管时序断言改为等待异步完成。`pnpm run check` 绿（**60 文件 / 559 测试** + pack 闸门）。
- **Lab 验证（DSH 0.2.1-rc.3 + 官方 session-titles bundle，`DSH_HOME=~/.dsh-lab`，3082）**：修复前连续复现 `did not activate … already registered`（与你桌面截图逐字一致）；修复后「添加模型提供商」连续两次（mistral、qwen-token-plan）均返回「已保存」，无任何激活告警；随后新建会话发送首条消息，标题正常生成（「验证结果一词总结」），证明命名接管在配置重写后仍然有效。

## v0.4.42

与第三方自动模式插件 `@log.li/dsh-automode` 的插件层适配：**不改用户配置、不新增依赖、不安装任何东西**——本插件在自己的 loader 行里，把「自动审查路由」与「纯读名单」注入到 `@log.li/dsh-automode` 行的**内存配置**，让它的 `auto-mode` 档位沿用我们的路由与豁免。

- **新行 `model-switch-automode-compat`**（`dsh-model-switch/automode-compat`）：`inject = ['loader','modelSwitch']`，在 `loader/patch-context` 里于该行挂载前改写 `entry.options.config`；行不存在时整行空转。可在插件管理器里单独停用，不影响审查闸门。
- **路由**：仅当 automode 的 `classifier.provider` / `classifier.model` **都为空**时填入我们的 `autoReviewProvider/Model`；任一字段已有值即视为用户意图，绝不覆盖（状态里标 `user-set`）；我们将自己上次写入的值记为可重写，设置变更时能跟随更新。
- **纯读豁免**：把我们的名单（默认 58 条）并入它的 `readOnlyTools`，并在「纯读工具免审查」开关关闭时**不注入**。它用精确匹配，所以 `sessions_list__*` 这类通配条目会跳过并在卡片上计数（默认名单里是 1 条）。注入后的工具仍会先过它自己的 deny 正则——不会削弱它的硬底线。
- **不落盘**：只改运行时 `entry.options`，从不调用 `Entry.update()`；启动前后 profile 的 `cordis.patch.yml` 不变，重启自动重放。
- **可见性**：「审查豁免」卡片新增一行 `Auto mode 已接入：审查路由 <provider>/<model>，直通 +N 个纯读工具（M 条通配未同步）`，未安装时不显示；`tools` RPC 的 `status.automode` 提供同数字段。
- **rc.3 lab 实测**（3083 / `~/.dsh-lab3`，automode `0.17.0` + 本插件 0.4.42）：automode 的 `boot` 审计行出现；在 `auto-mode` 会话的工具调用里，它的闸门实际读到 `preset="auto-mode"`、`classifier={"provider":"apigoto","model":"mimo-v2.6-flash",…}`、`readOnlyTools=58`、`preExecuteGate=true`（即注入生效）；启动前后 profile `cordis.patch.yml` 的 sha256 一致（未落盘）；卡片显示「Auto mode 已接入：审查路由 apigoto/mimo-v2.6-flash，直通 +53 个纯读工具（2 条通配未同步）」。注：automode 的逐调用审计行本次未出现，是因为它对未升级的 workspace-write 调用按设计静默放行，与兼容性无关。
- **边界**：它的分类器只有一个静态路由，逐步 provider 分组无法映射过去（取顶层自动审查路由）；它的 `readOnlyTools` 精确匹配，通配条目转不过去；这些都在文案与文档里写明。

## v0.4.41

DSH `0.2.1-rc.3`（2026-10-23 发布，当前在 `next` 通道）兼容性更新：**插件本体零改动**，本轮做的是实证与声明；旧线（`0.1.7-alpha.2` … `0.2.1-rc.2`）的声明与依赖下界原样保留。

- **rc.3 是纯客户端加法**（compare `dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3`，300 个文件）：`ui-conversation` 只新增 `conversation.session.header.views.actions` 槽位与 header 的 `entryPins`/`entryActions`/`setPinned`（`conversation.composer` 链与 `ComposerChainProps` 一字未改）；输入侧新增 `whenDraftExists`，`clearPreviousDraft` 语义保持兼容（本插件从不调用 `requestDraftInitialization`）；`ui-user-questions`、`ui-primitives` 只加不改；`experimental-auto-review`、`dsh-tools`、`dsh-session`、`dsh-subagent` 与 `api/*` 源码未变（只有版本号）。
- **rc.3 lab 实测**（独立 home `~/.dsh-lab3`、端口 3083、`@deepseek-ai/dsh@0.2.1-rc.3`）：挂载无 `best-effort on unverified runtime` 告警；「审查豁免」卡片正常，「恢复默认名单」得到 **58 条**；自动审查预设下 `read`+`glob`+`read` 让跳过计数到 **3**，随后 `write` 让计数保持 **3**（写操作仍走审查）；计划卡「去聊天里说」使回合以 **`aborted`** 结束、输入框回来、显示「已停止」；草稿跨会话切换保留（rc.3 的修复点）。
- **rc.2 回归**（3082，同一份 0.4.41 产物）：挂载正常、卡片正常、`glob`+`read` 跳过计数 **2**，与 0.4.40 行为一致。
- **声明**：`package.json#dsh.compatibility.dshReleases` 增加 `0.2.1-rc.3`；`README.md`、`README.zh.md` 与 `docs/dsh-compat-watch.md` 同步（含「rc.3 走 `next` 通道」与本次「用户显式要求、先于 `latest` 触发」的例外记录）。
- **测试**：`tests/compatibility.spec.ts` 新增两例——真实 `package.json` 必须同时保留旧线与 rc.3 的声明；rc.3 分类为 verified（不产生告警），未知版本仍 fail-open。

## v0.4.40

按你的点名，默认豁免名单从 47 条扩到 **58 条**：新增 11 个工具，全部在「设置 → 模型切换 → 审查豁免」里可查、可删、可恢复默认。

- **纯读 / 无副作用（6 个）**：`load_workspace_dependencies`（只返回打包依赖路径与版本）、`wait_agent`（只等待队友变化）、`ask_user_question`（把问题抛给人，决策权本来就在人手里）、`present`（只登记交付物卡片，不复制内容）、`sidebar_open`（只在侧栏打开文件/文件夹/URL）、`exit_plan_mode`（计划门由人审批，第二个审查者多余）。
- **只派发、副作用仍留在审查内（3 个）**：`send_message`（给队友投递消息，目标会话的预设是它被创建时定好的）、`team_task_create`（只写共享任务板）、`terminal_open`（只起 shell，后续 `terminal_send` 仍在审查）。
- **自治项（2 个，按你的明确决定放出）**：`create_goal`（创建持久目标，让本会话跨轮继续）、`schedule_create`（排一条未来投递的提示）。它们触发的新回合仍跑同一个 auto 预设，所以每轮里的工具调用照样逐次审查；风险是无人值守的 token 消耗，已在名单注释里标明。
- **明确排除：`subagent` / `subagent_fork` / `spawn_teammate` 永不进默认名单。** `dsh-subagent` 生成子会话时会读 `permissionPresets.current(parent.session)`，只有 `auto` / `danger-full-access` 会被继承；而本插件在"名单命中的调用正在飞"时把 `current()` 答成 `'custom'`——放行这三个会让子会话拿不到 auto 预设，等于造出**无审查的子 agent**。`tests/tool-allowlist.spec.ts` 新增 `DELEGATION_SPAWNS` 专项守卫，防止以后被顺手加进去。
- **守卫调整**：`MUTATING` 里移除 `send_message`、`team_task_create`（现按"派发类"放行），补入 `subagent`、`subagent_fork`。
- **注意**：默认名单只是"出厂值"。已经保存过名单的部署（含桌面）升级后不会自动多出这 11 条——需要点一次「恢复默认名单」，或手动加入。
- 测试：59 个测试文件 / **541** 测试（新增 delegation 守卫与"用户放行清单"两例）。

## v0.4.39

「自动审查」下，**纯读工具不再调用审查模型**：`read` / `grep` / `glob` 这类只读调用直接执行，写操作、命令执行与删除仍然逐次审查。功能默认**关闭**，在「设置 → 模型切换 → 审查豁免」一键开启。

- **机制：让官方 gate 自己走 `next()`，不截断流水线。** 官方 `@deepseek-ai/dsh-experimental-auto-review` 的 `tools/pre-execute` 监听器首行是 `if (permissionPresets.current(session) !== 'auto') return next()`——它对本插件挂载的 `permissionPresets` 影子提问。`defensivePermissionPresets().current()` 现在只在「当前有工具调用在飞 ∧ 该调用名命中名单 ∧ 真实预设就是 auto」时回答 `'custom'`，gate 因此自己跳过审查并调用 `next()`：其它 listener、`ctx.tools.guard` 与沙箱策略全部照常执行。只在飞行的异步上下文内生效（`AsyncLocalStorage`），工具调用之外的 `current()`（teardown 记账、设置卡片）仍报告真实值。读设置失败、名单为空、工具名为空一律 fail closed（照常审查）。
- **默认名单（47 条）按本机实测校准，覆盖本机 105 个工具中的全部纯读项**，每条都能回溯到来源与仓库：

  | 来源 | 仓库 | 默认放行 |
  | --- | --- | --- |
  | DSH 核心 | https://github.com/deepseek-ai/deepseek-harness | 25 条（`read` `grep` `glob` `read_image` `skill` `web_search` `web_search_pro` `web_fetch` `job_list` `job_output` `terminal_list` `terminal_read` `list_agents` `team_task_list` `team_task_get` `get_goal` `schedule_list` `list_mcp_resources` `list_mcp_resource_templates` `read_mcp_resource` `session_search` `session_event_search` `session_event_read` `session_event_trace` `session_trace`） |
  | dsh-ops | https://github.com/T-Auto/dsh-ops | 2 条（`ops_read_files` `ops_discover_tools`） |
  | dsh-browser-cdp | https://github.com/drscrewdriver/dsh-browser-cdp | 5 条（`bcdp_status` `bcdp_help` `bcdp_doctor` `bcdp_snapshot` `browser_window_status`） |
  | dsh-auto-memory | https://github.com/AskTheWay/dsh-auto-memory | 2 条（`memory_list` `memory_read`） |
  | MCP `wincu`（dsh-computer-use-win） | https://github.com/Yu-tao-Li/dsh-computer-use-win | 11 条（`accessibility_tree` `element_info` `find` `health` `list_windows` `ocr` `screenshot` `snapshot` `tools` `wait` `wait_for`） |
  | QQ 机器人扩展（框架 @zaofan/dsh-qqbot） | https://github.com/zaofan-make/dsh-qqbot | 2 条模式（`sessions_list__*` `bing_search__*`） |

  插件本身不注册纯读工具（`generate_image` 有副作用），因此不贡献默认条目。
- **通配符后缀**：QQ 机器人扩展的工具名是 `<工具>__<机器人名>`，机器人名可自由修改，所以默认用 `sessions_list__*` / `bing_search__*` 而不是写死 `__YiXuan`；换 bot 名无需改配置。裸 `*` 与 `*开头` 的条目在校验层直接拒绝，防止把名单配成"全部放行"。
- **设置界面可编辑并声明来源**：新增「审查豁免」卡片——开关即时保存（开关与名单作为一次原子写入，永不出现"开着但名单是旧的"）；每一行显示工具名 + 来源徽章 + 仓库链接；可按工具名/来源搜索；「恢复默认名单」；「扫描本机工具」调用新增的 `tools` RPC（`ctx.tools.schemas()` 公开接口）列出本机存在但未放行的工具，一键加入；扫描后还会显示本 Host 进程的实时计数「已为纯读调用跳过 N 次审查」，用来确认豁免真的生效。
- **测试**：新增 `tests/tool-allowlist.spec.ts`（16 例：默认名单规模与禁项、通配符匹配与裸 `*` 拒绝、来源解析六类分支、仓库表完备、RPC 负载与计数解码）与 `tests/auto-review.spec.ts` 的 5 例豁免语义（在飞/非在飞、非 auto 预设、计数、拒绝）。`pnpm run check` 全绿（59 个测试文件 / **539** 测试 + pack 闸门）。
- **lab 实测（`DSH_HOME=~/.dsh-lab`，3082，0.2.1-rc.2 官方 Host）**：手动选「自动审查」预设 + 开关开启后，一轮里 `read`×2 + `glob`×1 让计数变成 3（确实跳过了审查）；同一会话再 `write` 一次，计数仍是 3（写操作没有被豁免，仍走审查并被放行）；把开关关掉后再跑 `glob`+`read`，计数保持 3（审查恢复）。
- **本地留档**：`review/allowlist-excluded.md` 列出了本机 105 个工具中未放行的 58 个及其来源与原因，`.gitignore` 已忽略 `review/`，不推送、不进包。
- **「去聊天里说」改为中断回合，不再收起工作步骤**（`src/picker/discuss-plan.ts`、`src/client/picker/PlanReviewCard.tsx`、`src/client/picker/install.tsx`）。之前该按钮只做 `PendingQuestion.dismiss()`：计划工具返回 `ASK_CANCELLED`，模型再回一句，回合以 **completed** 结束，于是按官方「工作步骤收起时机=回答结束后」把步骤折叠——想边看计划边讨论就得手动再展开。官方 transcript 的折叠判断是 `alwaysOpen = … || reason === 'aborted' || reason === 'interrupted' || reason === 'error'`（asar `ui-chat` 的 `ChatGroupSeat`），所以改成走官方「停止」同款路径 `conversation.cancel()`（会话作用域公开方法），回合以 **aborted** 结束：输入框照样立刻回来、工作步骤保持展开、并显示「已停止」标记；取消接口不可用或被拒时自动回落到原来的 dismiss，不会让按钮失效。新增 `tests/picker/plan-discuss.spec.ts` 5 例覆盖中断 / 回落 / 无会话 id / 取消失败。lab 实测：计划卡上点「去聊天里说」后，会话日志的回合结束原因是 `aborted`（不再是 `completed`），输入框立即回来、会话显示「已停止」，工作步骤保持展开。

## v0.4.38

计划卡的「设置为目标并执行」现在会**真的顶掉**旧目标：宿主把 `GoalError` 经 RPC 网关中转成 `gateway/internal`，而插件只认 `GOAL_ALREADY_EXISTS`，于是 get→clear→create 的替换分支一直是死代码，点一次报一次「设置目标失败」。

- **P0 root cause: the conflict was matched on a code the gateway never sends (`src/picker/plan-goal.ts`).** `@deepseek-ai/dsh-goal` 的 `create()` 对任何非 `complete` 的现存目标 `throw new GoalError('goal "…" already exists with phase "…"', 'GOAL_ALREADY_EXISTS')`；网关把它转成 `{ code: 'gateway/internal', message: <原文> }`。插件比较的是 `error.code === 'GOAL_ALREADY_EXISTS'`，永远不成立，替换流程从未执行——用户看到的就是 `设置目标失败：gateway/internal: goal "goal-32ce…" already exists with phase "paused"`（该会话目标卡在 paused）。已核对内核实现：`clear(agent, ref)` 只做 id+revision 的 compare-and-set，**不限制 phase**，所以 active/paused/blocked 都能被顶替；`create` 只放过 `complete`。
- **Fix 1: recognise both refusal shapes.** `isAlreadyExistsError()` 先认域码，再用 `/already exists with phase/i` 识别网关转述的文本。只有这条消息才允许清旧目标——其它 `gateway/internal` 拒绝（如 agent 不存活）一律不碰现有目标，用例钉死。
- **Fix 2: transport failures no longer escape.** `create` / `get` / `clear` 全部经 `guarded()`：被 reject 的调用转成 `{ code: 'GOAL_TRANSPORT', message }` 的拒绝信封，不再冒泡成未处理异常（否则卡片丢掉错误态、计划停在待审却没有解释）。
- **Fix 3: readable messages.** `normalizeHostMessage()` 剥掉 `gateway/xxx:` 前缀，`failure()` 丢弃传输层码，卡片不会再出现双重前缀；失败信息在源头就干净，卡片无需改动。
- **Tests.** `tests/picker/plan-goal.spec.ts` 新增 6 例：网关形状的 paused / blocked 替换、非冲突网关拒绝不清目标、create / get / clear 三处 reject。`pnpm run check` 全绿（56 测试文件 / **510** 测试 + pack 闸门）。
- **Lab verification（0.2.1-rc.2，`DSH_HOME=~/.dsh-lab`，端口 3082，`mimo-v2.6-flash`）——端到端跑通了修复后的路径。** 在装了 0.4.38 的 lab Host 里用真实计划卡走完两轮：第一轮会话无目标，点「设置为目标并执行」→ `21:35:05 goal/change create goal-720a677c active`，计划执行完后自动 `complete`；随后用 `create_goal` 造了一个**未完成**的旧目标（`21:36:04 create goal-95e79b84 active`），再提交第二个计划、点同一个按钮 → 会话日志记录 **`21:39:54 goal/change clear`** 紧跟 **`21:39:54 goal/change create goal-358a71b2 active`**，卡片没有任何报错。也就是说 get→clear→create 的替换分支在真实 Host 上确实跑起来了。说明：本次没有做 0.4.37 的 A/B 对照（修复前该分支不可达，用户桌面上报出的 `gateway/internal: … already exists with phase "paused"` 就是它失败的现场）；另外 lab 宿主本身有两处损坏，先修好才跑通：`session-query-sqlite@0.2.1-alpha.2` 与运行时 0.2.1-rc.2 不兼容导致 `sessionController` 不可用（升级 `dsh-experimental-session-search` 到 rc.2 解决），以及工作区注册表为空导致无法新建会话。

## v0.4.37

「能力路由」四张卡片现在说明自己的层级：摘要行是**默认（无组时）**的值，另起一行列出所有覆盖它的供应商配置组，改完组不再看起来像"没生效"。

- **纯展示改动，解析行为不变。** `resolveCapabilityRoute` 仍是「组 ?? 默认」（`src/session-route.ts`）：压缩 / 自动审查 / 子代理是单次静态解析、不做失败回落，会话命名仍走既有候选链（组对 → 默认对 → 行自身对）。
- **新增 `capabilityGroupPins(groups, capability)`（`src/session-route.ts`）**：按 provider 排序收集"固定了该能力"的组；组内空串或半对一律视为未固定，因此 `titleProvider: ""`（跟随会话模型）不会被误当成固定值。
- **卡片新增一行 `note`（`src/client/ModelSwitchSettings.tsx`）**：子代理、自动审查、压缩、会话命名四处；≤3 个组时全列（`组覆盖：apigoto → apigoto · gpt-6-luna；…`），超过 3 个折叠为「… 等 N 个组」；无组覆盖时**不渲染**，与旧版输出一致。子代理行额外带上组里的 `subagentReasoningEffort`。
- **文案**：`src/client/locales.ts` 新增 `groupOverridesLabel` / `groupOverridesMore`（zh + en）。
- **测试**：`tests/capability-group-pins.spec.ts` 四例（provider 排序 / 子代理 effort / 空串跳过 / 无组表）。`pnpm run check` 绿（57 文件 / **508** 测试 + pack 闸门）。
- **Lab 验证（正式版 0.2.1-rc.2，`DSH_HOME=~/.dsh-lab`，3082，released artifact）**：注入一个 `deepseek-account` 组后打开「设置 → 模型切换」，子代理/自动审查/压缩三张卡片出现 `组覆盖：deepseek-account → deepseek-account · deepseek-flash；无组时用上方默认值`，会话命名因组内留空**不出现**；随后把组里自动审查与子代理两项清空，重载后组覆盖行从 3 条降为 1 条（只剩压缩）。改动在运行时重组后立即反映，无需重启。

## v0.4.36

「自动审查」不再在插件安装类重组后停在「完全权限」：Auto 选择改为**持续记录**，回放只消费真正恢复掉的会话。

- **P0 root cause: the snapshot could be destroyed before it was written (`src/auto-review.ts`).** `persistAutoSnapshot()` read the live session list at release time and **deleted the file whenever that read came back empty**. Two release orderings make it come back empty: the official gate's teardown can flip the `auto` sessions to the fallback preset *before* our teardown effect runs (a plugin install / bundle edit recompose reorders the rows), and a row that is going away can lose access to the session service entirely (`rememberAuto()` swallowed the error and returned `[]`). Either way the record was removed — `$DSH_HOME/model-switch/` was observed empty afterwards — and the next `claim()` had nothing to replay. Session-log evidence: four recomposes flipped and restored the selection within ~60 ms, and the single recompose that added a plugin row (18:20:56Z) flipped it and never restored.
- **Fix 1: a continuous record that survives reordering.** Every session's `permission/preset` feed is wired to the record as the session is seen; a change that arrives while this row has released the registration is the official teardown flip (not a user choice) and keeps its id recorded, anything else removes it. Release-time `persistAutoSnapshot()` now merges the live read **into** that record instead of replacing it, so an empty or failed read can no longer destroy the selection.
- **Fix 2: a replay consumes only what it restored (`src/auto-sessions-state.ts`).** `planAutoSnapshotReplay()` splits the recorded ids into the ones a live session claims and the rest; the rest stay in the file with their **original** `savedAt` — an early claim cannot eat the selection of sessions that load later, and the 15-minute replay window is not restarted behind the user's back. `flushAutoSnapshot()` removes the file only once every recorded id has been replayed.
- **Tests.** `tests/auto-sessions-state.spec.ts` adds the timestamp-preserving decode, the merge semantics that pin the out-of-order teardown case, the empty-list no-consume case, and a repeated-recompose pass that narrows the record to empty. `pnpm run check` green (56 test files / **504** tests + pack gate).
- **Lab verification (official 0.2.1-rc.2, `DSH_HOME=~/.dsh-lab`, port 3082) — and one gap it exposed, now closed.** The build was installed in both lab profiles and driven against the released `0.4.35` as the A/B: with a session on「自动审查」the plugin was removed and re-added, a new plugin row was inserted through `cordis.patch.yml`, and a bundle-list change forced a recompose. The record half of the fix ran end to end there — a teardown wrote `auto-sessions.json` with the exact session id, the record survived the plugin being absent, and the next mount's replay consumed it. That replay is what the lab caught being incomplete: a claim runs before the web Host has lazily loaded the session, so ids could sit in the file forever with nobody to consume them. The replay now also runs whenever a session is observed, on tool-call activity, and from a bounded 10-second sweep while the record holds ids — the file observed still pending after a plugin swap was consumed by the next session load. The flip itself (`auto` → `danger-full-access`) does not reproduce in the lab — even a full plugin removal leaves the stored preset name untouched there — so that scenario stays covered by the desktop session-log forensics above and the out-of-order teardown tests. Open-item audit of the deletion path: the empty-list delete has **no second loss face** — every caller (`trackAutoSelection`'s explicit un-select, a fully consumed replay, a teardown merge, and the stale/malformed cleanup in `flushAutoSnapshot`) deletes only a record that already decodes to empty. The one theoretical residual is on the *recording* side, not the deletion side: a session that switched to Auto while never observed (listener not yet wired) plus a teardown whose live read fails at the same moment; the observation passes (claim, replay, tool calls, 10-second sweep) bound that window to one sweep interval. Closing it entirely needs a session-load event on the public `sessions` face, which does not exist — recorded for a later upstream proposal, per the repo's public-seam rule.

## v0.4.35

「自动审查」不再在每次热重载后掉回「完全权限」：释放 Auto 注册之前先把当时选着 Auto 的会话落盘，重新认领后按 id 恢复。

- **P0 root cause: every release moves the selection, and the in-memory guard dies with the row (`src/auto-review.ts`).** The official gate's teardown moves live `auto` sessions to the fallback preset (`danger-full-access`) by design. This row triggers that teardown on both of its release paths: the `yieldRegistration` seam the takeover runs before a recompose, and its own row disposal during a hot reload. `preserveAuto` could not cover either window — it remembers around an **in-process** action, but a reload loses the selection before anything of ours runs again, and the next mount's `rememberAuto()` returns `[]` because the sessions were already flipped. The user-visible symptom: the session kept reverting from「自动审查」to「完全权限」, reproducibly **at the moment `cordis.patch.yml` was edited** (any profile patch edit forces a recompose).
- **Fix: durable snapshot + replay (`src/auto-sessions-state.ts`, `src/auto-review.ts`).** `persistAutoSnapshot()` writes the ids of the sessions currently on Auto to `$DSH_HOME/model-switch/auto-sessions.json` **before** each release — from the takeover's `yieldRegistration` seam and from the last-registered teardown effect (the first thing to run on disposal). `claim()` then calls `flushAutoSnapshot()` once the registration is held again, restoring exactly those sessions and consuming the file. A snapshot is rejected after 15 minutes (`AUTO_SESSION_STATE_MAX_AGE_MS`), so a later restart cannot resurrect a preset the user has since chosen; every malformed shape degrades to a no-op, and a read-only `DSH_HOME` never blocks the release.
- **Tests.** New `tests/auto-sessions-state.spec.ts` pins the round trip, dedupe and dropping of non-string ids, the malformed-shape matrix (missing, empty, invalid JSON, wrong shape, non-numeric `savedAt`), and the 15-minute replay window. `pnpm run check` green (56 test files / **500** tests + pack gate).
- **Live verification (before tagging).** The build was installed into the real desktop profile and the web UI was driven over CDP from this machine: the session was switched to「自动审查」, a `cordis.patch.yml` edit forced a recompose — the exact action that used to flip the preset — and the preset chip in the live page still read「自动审查」afterwards. The snapshot directory (`$DSH_HOME/model-switch/`) was created and consumed by the same recompose, so the persist → replay path ran end to end.

## v0.4.34

The「停用失败：dsh: warning: 1 entry did not activate auto-review … permission: preset "auto" is already registered」toast is gone: every official-row activation now gets the registration yielded first, and this row releases the slot in the first synchronous step of its own teardown.

- **P0 root cause: the yield was one-shot (`src/auto-review-takeover.ts`).** The `loader/patch-context` listener kept an `handled` set so "a repeated patch-context does not loop" — but that guard also **skipped the yield from the second activation on**. The loader calls `_patchContext([])` right before every `registry.plugin` mount (confirmed in the loader source: `Entry._init()` = import → `_patchContext([])` → `registry.plugin`), and a plugin-manager enable goes through `Entry.update({ disabled: false }) → init()` — so the re-activating official row's `registerAuto` ran while this row still held the slot, failed with `preset "auto" is already registered`, and the manager reported the whole operation as 「停用失败」. `Entry.update({ disabled: true })` never emits `partial-dispose`, so the set was never cleared and the suppression was permanent. The guard is gone: **every** activation of the official row yields synchronously before the loader continues (`releaseForTakeover` is idempotent), and the existing per-entry single-flight reclaim keeps repeated triggers on one cycle, so this cannot loop. Two regression tests pin it: a second activation yields again, and non-official rows stay out of the way.
- **Release first on our own teardown (`src/auto-review.ts`).** Disposing the gate fiber now releases the Auto registration in its **first synchronous step** (the loader does not await fiber disposal, and the official row's re-activation in the same recompose must find the slot free), and a last-registered effect releases it again as the teardown's first step — belt-and-braces for registrations claimed without a gate fiber (a direct `reclaimRegistration()`).
- **Live reproduction and verification.** Reproduced on the real desktop Host through the web UI before fixing: enabling「自动授权审查」with `dsh-model-switch` active **failed twice** (the switch silently reverted), and the very same operation succeeded with `dsh-model-switch` disabled — the seam conflict isolated by a single variable. `pnpm run check` green (55 test files / **496** tests + pack gate). Post-fix web-UI regression covers enable/disable cycles with the official row active: no toasts, no warnings, no failed activations.
- **Diagnosis recorded (the reported "运行失败" was not this plugin).** The turn-28 outage was a **model-request transport failure** (`Connection error.` / `TRANSPORT`, provider `apigoto`, five fast rejections in 8 s) — the same failure class this deployment has seen on provider accounts before (10-13 `ark` ×10, 10-15 `xiaomi` ×29). A web-UI A/B with this plugin **on and off** ran 5/5 model requests clean in both states (and the naming call alongside), and this repo has no code path that touches the request transport (no `llm/stream` listener, no fetch/global patch). The 17:49 recovery after disabling plugins is confounded: the permission preset flipped `auto → danger-full-access` in the same minute, which also removes the per-tool-call review traffic against the same account.

## v0.4.33

The reviewer takeover now reports its own health to the settings page instead of only writing a Host log line.

- **Runtime-capability field (`src/runtime-capabilities.ts`, `src/host-runtime.ts`).** `autoReview` joins the capability snapshot: `{ available: true }` while this row holds the official reviewer route, `{ available: false, reason: 'auto-review-takeover' }` once it does not. The value comes from a live record (`autoReviewStatus` in `src/auto-review.ts`) updated on every claim, on the lost-seam path, and by the tool-call safety net — which also counts the calls it allowed unreviewed, so the card can say how much review was skipped.
- **Settings card warning (`src/client/ModelSwitchSettings.tsx`, `src/client/locales.ts`).** The「自动审查」section renders `autoReviewTakeoverNote` while the route is held and `autoReviewTakeoverWarning` otherwise (zh + en: tool calls keep running, those calls are unreviewed, restart DSH to converge). What used to be a Host-only log line is now visible where the human configures the route.
- **Verification.** `pnpm run check` green (55 test files / 494 tests + pack gate). The safety net's test now also asserts the allowed-call counter the snapshot reads, so the card's data path is covered end to end (host record → capability snapshot → card text selected by `available`).
- **Lab reproduction of the reported outage (released artifact).** The published `dsh-model-switch@0.4.33` was installed in the lab profile (`DSH_HOME=~/.dsh-lab`) with the official `auto-review` row **force-enabled** in the profile patch, the Host was booted on 3082, and the web UI was driven over CDP (a dedicated Edge instance, the user's own browser untouched). A first real tool call completed in 8 s with the actual directory listing. **Without restarting the Host**, `dsh plugin --profile lab remove dsh-model-switch` + `add dsh-model-switch@0.4.33` performed the hot swap and the profile patch toggled the official row off and back on (two runtime recompositions); a second real tool call then completed in 7 s with the file list, and the page contained **no** `inactive context` / `cannot get required service` / `body was not executed` / `Auto review of tool` failure. This is the disable → remove → install → enable sequence that used to require a DSH restart.

## v0.4.32

A hot install could still break every tool call: replacing the plugin (disable → remove → install → enable, **without a DSH restart**) leaves the official `auto-review` row serving while this row's takeover is still trying to displace it, and its unshielded probe fails each call. This release makes that window non-fatal and shortens it.

- **P0: a broken reviewer seam no longer fails tool calls (`src/auto-review.ts`).** `installToolCallSafetyNet` registers a `{ prepend: true }` `tools/pre-execute` listener on this row's **own context**, so it is live even when the gate could not mount — the one window the defensive `permissionPresets` shadow cannot cover, because that shadow lives in the review scope while the serving official gate resolves the real service from the profile. It catches only seam failures (`inactive context`, `cannot get required service`, `cannot get property`, `without inject`, `TRANSPORT`), returns `{ kind: 'allow' }` so the body dispatches, and reports once with the fiber-chain dump. It is **inert while this row holds the route** (`isDegraded: () => !presets.registered`), so another plugin's broken listener keeps failing closed; reviewer transport/quota errors (`RATE_LIMIT`, `PI_AI_ERROR`) keep failing closed too — "the reviewer declined" and "the reviewer could not talk" are not broken seams. The waterfall only decides whether the body runs, so allowing here never masks a tool failure.
- **The takeover budget matches a real disposal (`src/auto-review-takeover.ts`).** 20×10 ms (~200 ms) → 60×50 ms (~3 s), plus `TAKEOVER_LATE_RETRY_DELAYS_MS` = 500/1000/1500 ms: three bounded re-claims after the loop gives up, because `Entry.update({ disabled: true })` starts the displaced fiber's teardown and the loader does not await it. A disposal that unmounts a gate, restores permission presets and unwinds fibers outlasted the old budget, which is exactly the reported hot-swap window. Timers are cleared with the row.
- **Actionable failure log.** The lost-seam error now says both what happens next ("the reviewer path is shielded instead of failing tool calls") and what the human can do ("Restart DSH to converge the reviewer row — a hot install cannot always displace the official row in time").
- **Docs.** `docs/seam-gap.md` records the two remaining gaps: no public seam lets a plugin **replace a bundled capability row at runtime** (only disable-and-reclaim through the loader), and the loader cannot address a row nested in a preset's `config.plugins` — the official bundle row is top-level today, but a future nesting would need a config-level bridge like 0.4.27's preset bridge.
- **Verification.** `pnpm run check` green (55 test files / 494 tests + pack gate). New coverage: the net allows the call and reports exactly once when the seam is broken, stays inert while this row holds the route, rethrows a reviewer quota error, and classifies an inject failure apart from a denial. The late-retry schedule is bounded by the row's lifetime. **Lab evidence, released artifact:** the published `dsh-model-switch@0.4.32` was installed into the lab profile (`DSH_HOME=~/.dsh-lab`, dependency pinned to the registry version) and booted on 3082 with the official `auto-review` row **force-enabled** in the profile patch — the Host started, served its token URL, and reported no failed activation, so the takeover and the new budget converge at startup on the immutable artifact. **Still not reproduced:** the *runtime* toggle (enabling the official row while the Host is already serving) together with a real tool call — plugin logs do not reach stdout in web mode, so that needs the Host API or a browser-driven session.

## v0.4.31

The recurring tool-call outage is closed at both ends it can be closed from: this plugin now **takes the Auto-reviewer seam over** from the official `auto-review` row (yield-then-claim, the session-title pattern), and its own gate's preset probe can no longer fail a tool call even while the preset service is broken — with a fiber-chain dump in the one degradation log so the upstream half of the failure names itself next time.

- **P0: the official `auto-review` row runs again and every tool call dies (`src/auto-review-takeover.ts`, `src/auto-review.ts`).** v0.4.30's defensive shadow protected only **this row's** gate; at 15:22:34 the plugin manager wrote `- id: auto-review / disabled: false` into the profile patch layer (it applies after every bundle layer, so this plugin's static `disabled` can never win), the official row re-activated beside this one, and its **unguarded** probe — `permissionPresets.current(session)` is the first `tools/pre-execute` step — turned every tool call into `cannot get required service "sessionProjections" in inactive context` until the plugin was disabled and the Host restarted. Two live rows are not survivable on that seam at all: `registerAuto` is single-registration, and whichever row loses it cannot keep serving. The row now displaces the official one through the loader's released seams (the same choreography as the session-title provider slot): on `loader/patch-context` it releases the Auto registration **synchronously before** `next()` — the loader runs the entry's plugin `apply` in the same turn, so an awaited yield would collide — lets the official row apply cleanly, disables it through `Entry.update({ disabled: true })`, and re-claims the registration with a bounded retry; `loader/partial-dispose` re-claims when a toggled-back-on official row goes away again, and an initial sweep covers rows composed before this one. Manual toggling of the official「自动审查」component is now a logged, self-healing no-op instead of an outage.
- **The Auto selection survives every displacement.** Disposing a gate moves live `auto` sessions to `danger-full-access` by design (the official teardown runs on both the displaced row and this row's own re-mounts), so every takeover step runs inside a preservation window that remembers the sessions on `auto` and restores them after the registration is live again.
- **P0: the preset probe can no longer fail a tool call, and the shadow is always on (`src/auto-review.ts`).** `defensivePermissionPresets` now resolves the presets service **lazily per call** (the shadow protects even while the service is still activating), degrades `current()` to `custom` so the gate skips review and runs the tool body, swallows a failing teardown `set()`, and reports the lost capability **once** — now including the exact resolution chain (`uid/state/name/inject` per fiber in the caller's chain). That dump matters because the upstream cause is real and recurring: `internal/get` walks the whole caller fiber chain and throws `… in inactive context` at the first fiber whose `inject` declares `sessionProjections` without a resolved snapshot — and **twenty-four** released rows declare it (`dsh-permission-presets` itself, `dsh-session-title`, `dsh-plan-mode`, `dsh-token-meter`, `dsh-tool-todo`, `dsh-agent-loop`, …), so any one of them mid-reload can break an unguarded probe. The upstream fix and the missing seams are recorded in `docs/seam-gap.md`.
- **`registerAuto` is brokered, not swallowed.** The gate's registration is held through `releaseForTakeover()` / `reclaimRegistration()` so the takeover can hand the single slot over and take it back **without unmounting the gate** (unmounting is what flips live sessions off Auto). A `registerAuto` conflict now fails the gate's mount loudly and the takeover retries, instead of leaving an Auto preset that silently does nothing — the behavior 0.4.30 shipped and which hid the first recurrence.
- **Honest correction to the v0.4.30 entry.** That entry's model was half right and half wrong, and the real-package harness settled it: the raw message does come from the official gate's unguarded probe (reproduced exactly), but the "half-applied effect leaks its listener" explanation is **false** — when `registerAuto` throws mid-effect, cordis cleans the already-yielded listener up (verified: zero probe calls after the failed mount). The outage needs the official gate actually **running**, which is why 0.4.30's shadow (covering only this row's gate) did not prevent it and why this release makes the official row unable to run at all.
- **Visibility.** The settings card's「自动审查」section now says that the official component is replaced by this plugin's configurable reviewer route and is re-disabled with a log line when toggled back on; `docs/seam-gap.md` gains the two missing seams (no supersede declaration for a bundled capability row + two layers of `disabled`; the caller-chain `sessionProjections` resolution), and READMEs point at the takeover behavior.
- **Verification.** `pnpm run check` green (55 test files / 490 tests + pack gate). New coverage: strict package identity (an id-only lookalike is never disabled), the displacement claims the registration around the window that preserves Auto sessions, the reclaim retries until the displaced registration releases and reports the lost seam otherwise, the patch-context yield is **synchronous before** the loader continues, repeated events join one reclaim per entry, the partial-dispose path re-claims, the sweep catches earlier-composed rows, and the lazy shadow degrades while the service is unresolvable and brokers yield/reclaim with the same admit callback. With the **real published packages** (official `auto-review` gate + cordis): the pre-fix shape's half-applied effect leaves **no** leaked listener (hypothesis disproven), the yield-then-claim shape lets the official row apply cleanly and its failure still fail-closes as a clean deny, and the shipped shadowed gate returns `allow` for a tool call with a broken preset service.
- **Residual (honest).** If the displaced registration never releases within the bounded retry, the takeover reports the lost seam and the official row keeps serving (unguarded) until the next loader cycle — no silent half-state, but also no reviewer route override. The upstream `sessionProjections` chain break can still fail **other** rows' own reads (anything else that injects it); this plugin cannot defend those, and the fiber-chain dump is the evidence-gathering step for the upstream report. Toggling the official component remains visible in the plugin manager as the user set it — the takeover's in-memory disable is re-applied at every startup rather than written over the user's patch.

## v0.4.30

One live failure class, three fixes: after a provider-group save every tool call in the session died before its body ran with `cannot get required service "sessionProjections" in inactive context`, the settings page sometimes answered a provider-group save with the raw `settings-rejected` sentinel, and the composer's permission selector sometimes disappeared.

- **P0: every tool call failed while the Auto preset was selected (`src/auto-review.ts`).** The official `@deepseek-ai/dsh-experimental-auto-review` gate opens every `tools/pre-execute` waterfall with `permissionPresets.current(session)`. That call resolves the preset service's **own** `sessionProjections` injection, and `sessionProjections` is exactly what `permissionState()` reads; when that fiber has turned inactive the probe throws `cannot get required service "sessionProjections" in inactive context` **outside** the gate's reviewer-error wrapper, so the raw service error becomes the tool result and the body never runs. `reviewScope` now shadows `permissionPresets` next to the already-shadowed `llm` (`defensivePermissionPresets`): a failing `current()` degrades to `custom`, which makes the gate skip review and call `next()` so the tool body still runs; a failing `set()` during teardown is swallowed; a `registerAuto` conflict is reported as one log line instead of failing the gate. The degradation is logged once, not once per tool call.
- **Auto integration lifecycle (`src/auto-review.ts`).** `registerAuto` is single-registration with an **effect lifetime** — its disposer is what clears the Auto preset, and its absence is what makes `auto` disappear from `permissionPresets.names` (and a restore fail with `cannot restore preset "auto" without its active integration`). A re-applied row now disposes the previously mounted gate fiber and awaits it (`Fiber.dispose` settles after cleanup) before mounting the next gate, so a re-mount cannot hit `preset "auto" is already registered` and leave the catalog without Auto.
- **Takeover hardening (`src/session-title.ts`).** `isOfficialTitleRow` now keys on the cadence **package name** only, and `reclaim` re-checks that package before `entry.update({ disabled: true })`, logging every disable. The takeover disposes the matched entry's fiber, so an id-only match must never reach a group or another plugin's row.
- **Provider-group saves are fenced and retried (`src/client/provider-group-save.ts`, `src/client/index.tsx`).** A save now lands as one atomic `mutate(ops, revision)` under the revision it actually read. When the host refuses it (another card, another window, or the runtime's own capture write moved the fence), the save re-reads the snapshot and retries — up to three times — instead of losing the edit, and only then reports failure. The settings page shows a localized "保存被拒绝，请重试" instead of the raw `settings-rejected` sentinel.
- **Permission selector disappearing.** The official selector renders nothing while the permission catalog has no complete value or the session's permission selection is missing; both states came from the same Auto-integration and preset-service instability above, so the lifecycle fix removes the trigger. `docs/seam-gap.md` records this as official-UI behavior this plugin cannot change, plus the single-registration `registerAuto` seam.
- **Verification.** `pnpm run check` green (54 test files / 478 tests + pack gate). New coverage: the degraded probe returns `custom` and logs once, a healthy face stays transparent, a registration conflict is reported and its disposer resolves, a failing preset write during teardown is swallowed, the takeover refuses an id-only lookalike and never disables it, and the fenced save writes under the read revision, retries after one refusal, reports `settings-rejected` only after every attempt was refused, and clears the field when the last group is deleted. With the **real published packages** (`@deepseek-ai/dsh-experimental-auto-review` + `@deepseek-ai/dsh-permission-presets` from the 0.2.1 line): the pre-fix shape reproduces the exact live message through the gate's prepended listener, and the shipped shape runs the gate with the same broken preset service while the tool call proceeds.
- **Residual (honest).** The defensive shadow trades a failed reviewer for a running tool: while the preset service is broken, review is skipped with one explicit log line instead of blocking every call. The single-registration constraint still has no public replace API; the missing seam and the proposed upstream shape are recorded in `docs/seam-gap.md`.
- **A/B caveat.** The live "plugin off → tools fine" observation was confounded: the permission preset was switched from `auto` to `danger-full-access` in the same minute the plugin was disabled. The controlled matrix (plugin on/off × preset auto/full-access × plan mode on/off × fresh session/resumed session) is the confirmation step after installing this release.

## v0.4.29

The experimental "随对话更新的标题" bundle (`dsh-experimental-session-titles-bundle`) no longer fails to enable while this plugin is active: the naming row now takes over the single provider slot the bundle's row competes for, mirrors that row's cadence, and keeps the configurable naming route working.

- **What broke.** Enabling the bundle produced `1 entry did not activate optional-session-title-all-prompts (@deepseek-ai/dsh-session-title-all-prompts-llm): session-title provider "session-title-first-prompt-llm" is already registered`. DSH 0.2.1's session-title service accepts exactly one registered provider, and this row already owned that slot with its mirrored first-prompt provider. The bundle's patch inserts its all-prompts row **after** this plugin's patch layer, so the static `- id: optional-session-title-all-prompts` disable this plugin ships can never reach a row that does not exist yet when that layer applies.
- **Fix: the row now takes the slot over instead of colliding (`src/session-title.ts`).** It mirrors the official row that exists in the tree — all-prompts winning whenever the experimental row is composed, first-prompt otherwise — and it watches `loader/patch-context`, which the loader runs inside the official entry before that entry's plugin `apply`. When an official naming row is about to register, this row yields the slot first (the service lets a registration be replaced once its disposer ran), so the official `register()` **succeeds** and the loader reports no failed activation; it then disables that row through the public `Entry.update({ disabled: true })` (which disposes the row's fiber and closes its registration) and claims the slot back under the row's cadence. A bounded retry absorbs the cases where the loader has not created the row's fiber yet, and an initial sweep handles the reverse composition order (an official row that activated before this row started). Only seams the loader already publishes are used: the `loader/patch-context` waterfall, `Entry.update`, and `sessionTitle.register` plus its disposer.
- **User-visible behavior.** Enabling the bundle: titles now update with every prompt **and** the configured naming model / provider-group route keeps applying (the provider id recorded with each title is `session-title-all-prompts-llm`, matching what the official row would record). Disabling the bundle: the first-prompt cadence comes back with the same route override. A Host that changes activation timing degrades to "the official provider serves naming, one explicit log line" rather than a crash or a wrong route.
- **Verification.** `pnpm run check` green (53 test files / 466 tests + pack gate). New coverage: the all-prompts row wins the mirror, the takeover yields before the official registration and reclaims the slot with the mirrored cadence, repeat patch-context events are idempotent, an already-active row is swept, and no official row keeps today's single first-prompt registration. Real published packages on `0.2.1-rc.2` (the real `dsh-session-title` service plus the real `dsh-session-title-all-prompts-llm` apply): the official row registers with **no** `already registered` error, the displaced row is disabled through `Entry.update`, the plugin owns the slot again, and the live provider is `session-title-all-prompts-llm` / `all-prompts`.
- **Residual (honest).** The takeover choreographs released loader seams rather than a dedicated "supersede this provider" API; `docs/seam-gap.md` records the missing seam and the upstream proposal (a decorate/replace registration or a multi-provider slot). The reverse direction — disabling the bundle at runtime without a profile restart — re-claims through `loader/partial-dispose` where the loader emits it, and otherwise needs the restart DSH already asks for on bundle changes.

## v0.4.28

Two fixes for the same DSH `0.2.1-rc.2` line: re-enabling the plugin on 0.2.1 made **every tool call fail before its body ran**, and the Subagent routing adapter that 0.4.26 had to fail closed is adapted to the release's activation API.

- **P0: every tool call failed under the Auto preset on DSH 0.2.1 (`src/auto-review.ts`).** With the plugin enabled and the approval policy on Auto, each tool call was rejected with `Auto review of tool "…" failed; its body was not executed: cannot get property "workingDirectory" without inject` — read, grep, pwsh, even exiting plan mode. Root cause: `model-switch-auto-review` called `official.apply(scope)` **directly inside its own fiber**, so every service the official gate reads had to be mirrored in this row's `inject`; 0.2.1's gate started reading `ctx.workingDirectory`, and the mirror list had gone stale. Fix: the official gate is now **mounted as a plugin** (`autoReviewGate` → `scope.plugin(...)`), so cordis resolves the official dependency list — including `workingDirectory` on 0.2.1 and its absence on 0.2.0 — and this row declares only the services its own code reads (`llm`, `modelSwitch`). The session-correlation listener is registered only after the gate's fiber reports that its `apply` actually ran, so it still lands ahead of the gate's own prepended listener; an already-active official row still fails loudly (single `registerAuto`), and a gate still waiting for host services is reported instead of silently mis-ordering.
- **Subagent routing adapted to the 0.2.1 activation API (`src/subagent-runtime.ts`).** 0.2.1 replaced `start()` / `startContinuable()` with `startActivation(spec)`. The routed runtime now recognizes **either published line** (`subagentSurfaceOf`), keeps both legacy overrides unchanged, and adds a `startActivation` override that rewrites `spec.request.agentOptions` through the same `provider group → flat subagent card → session model` resolver (a caller-named route still wins; a provider whose capability is not `agentOptions` is still never reinterpreted). Only a Host publishing neither surface falls back to the untouched official runtime with `routedRuntimeUnavailableNotice`, so the 0.2.1 fallback path is now unreachable in practice.
- **Correction to the v0.4.26 entry.** That entry claimed the official auto-review `apply` "runs unchanged under this row's scoped `llm`" on 0.2.1. The live desktop showed otherwise: it ran unchanged only until the reviewer read a service the mirrored `inject` did not carry. 0.4.26 and 0.4.27 therefore shipped that failure on 0.2.1; 0.4.28 is the first release where the gate actually runs there.
- **Verification.**
  - `pnpm run check` green (52 test files / 460 tests + pack gate). New coverage: the inject trap reproduced with a real cordis `Service` (an unwrapped gate fails with the exact live message, the wrapped gate passes), the official dependency list surviving the mount, gate-failure reporting, `subagentSurfaceOf` for the activation line, the start line, and neither, activation-spec routing (session group, flat fixed pair, follow-main, explicit caller route, external provider), spec passthrough, and mounting the routed runtime on an activation-only Host.
  - **Real published packages, `0.2.1-rc.2`** (lab CLI `node_modules`, a real `Service` registration so the trap is live, the real official gate): the pre-fix shape reproduces exactly `Auto review of tool "pwsh" failed; its body was not executed: cannot get property "workingDirectory" without inject`; the shipped shape reaches `workingDirectory.ensure` (one call), registers the Auto gate once, and never fails on inject. The real 0.2.1 `SubagentRuntime` classifies as the activation line and drops `start`/`startContinuable`; the adapter delegates to that exact method with `request.agentOptions` rewritten to the configured subagent route while `provider` / `label` / `delivery` / `signal` / `parent` identity pass through.
  - **Real published packages, `0.2.0-rc.2`**: the row registers the Auto gate **without** a `workingDirectory` service, the gate never hits an inject failure, the runtime classifies as the `start` line, and `start()` delegation still rewrites the route and preserves parent identity.
  - **Lab plane** (`DSH_HOME=~/.dsh-lab`, npm-installed `0.2.1-rc.2` runtime, packed `dsh-model-switch-0.4.28.tgz` installed in the `labh` profile): a headless turn ran a real tool (directory listing) with no inject failure and no `{{cwd}}` error; a second turn spawned a real subagent, and the child session's own `subagent/descriptor` records `mode: continuable`, `provider: spawn`, `agentProvider: apigoto`, `agentModel: mimo-v2.6-flash` — the fixed subagent route configured for that profile, not the session default `apigoto/deepseek-flash`. That is the end-to-end proof that the activation-line override reaches the child's route on 0.2.1.
- **Residual (honest).** The live desktop is the only place the Auto preset gate runs end to end with a real tool body: after updating, re-enable the plugin, switch the approval policy back from full-access mode to Auto, and run one tool call. The harness above exercises the real 0.2.1 packages and the real cordis `Service` trap, but not a full session snapshot — the fake session stops the reviewer right after `workingDirectory.ensure`, by design. 0.1.7 / 0.2.0 keep the same entries, the same route precedence, and the same fail-closed behavior.

## v0.4.27

A fix for a regression v0.4.26 introduced on DSH `0.2.1-rc.2`, plus the architecture change that removes its cause: the plugin no longer ships static copies of DSH's agent presets.

- **What broke (v0.4.26, DSH 0.2.1 only).** Every turn failed before the first token with `unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"`, and the composer needed the plugin disabled to continue. Cause: `cordis.patch.yml` replaced `preset-standard` / `preset-ptc` / `preset-cordis` wholesale with copies captured from the **0.2.0** presets. Those copies carried `suffix: Your working directory is {{cwd}}.` in the `persona` row; DSH 0.2.1 validates prompt variables and registers only `provider` and `model`, and its own presets dropped the `cwd` variable — so composing the persona suffix threw for every new turn. The copies had also drifted: they lacked the `time-context` and `tool-schedule` rows that 0.2.1 moved into presets, so even without the fatal error those rows would have been missing.
- **Fix: bridge the nested compaction engine at Host startup instead of copying presets (`src/preset-sync.ts`, wired from `ModelSwitchRuntime`).** On startup the Host finds each `@deepseek-ai/dsh-agent-preset` declaring row in the loader, walks its nested entry lists, disables the nested `@deepseek-ai/dsh-compaction-basic` row, and inserts `model-switch-compaction` directly after it. Every other row, prompt text, and `!!js` expression is left exactly as the installed DSH (or a deployment that edited the preset in the Web editor) wrote it. An entry that has not started yet gets its raw config swapped in place; a started entry is reloaded through the public loader `entry.update`. A failure is logged once and the official preset stays mounted, so the turn still runs and compaction simply keeps the official default route.
- **Why the copies are gone for good.** The static copies were a pinned snapshot that silently hid every later DSH preset change — this regression is exactly that failure mode. Reading each installed release's own preset definition removes the per-release re-sync step and restored the `time-context` / `tool-schedule` rows on 0.2.1.
- **Verification.** `pnpm run check` green (52 test files / 450 tests + pack gate). `tests/preset-patch.spec.ts` was rewritten to pin the bridge instead of the copies: 0.2.0-shaped (persona `{{cwd}}` suffix) and 0.2.1-shaped preset configs, idempotency, a preset without a compaction group, matching by package + preset id, both bridge paths (raw-config swap and loader reload), reload-failure logging, and a check that the patch no longer replaces any preset row. Lab plane on `0.2.1-rc.2` (`DSH_HOME=~/.dsh-lab`, port 3082): the composed tree now carries the official presets (`persona` prefix only, no `{{cwd}}`, with `time-context` and `tool-schedule` restored) and a headless host with 0.4.27 ran a full turn end to end — the answer streamed normally, and the naming record shows the new chain: a failed group candidate (`apigoto/no-such-title-model`) fell through to the deployment pair, `session/title-llm-request` recorded `apigoto/mimo-v2.6-flash` with `reasoningEffort: off` on the 0.2.1 call shape, and the provider title replaced the fallback title.
- **Residual.** The desktop app updated to `0.2.1-rc.2` is still running v0.4.26 with the plugin disabled; re-enable it after updating to 0.4.27 to confirm the live turn on that machine. 0.1.7 / 0.2.0 compositions are untouched by this change: with no preset row replacement, they keep their own shipped presets, and only the nested compaction swap is applied by the bridge at startup.

## v0.4.26

Two coordinated changes: automatic session naming now survives a failing title route (the auxiliary call is retried and then falls through the candidate routes instead of leaving the deterministic fallback title in place forever), and official DSH `0.2.1-rc.2` is declared compatible — that release replaced the shared title call with a provider-prepared one and replaced the Subagent start surface with its activation API, so both seams are now handled per installed line.

- **Session naming: one failing route no longer owns the title (`src/session-title.ts`).** Evidence from the five sessions that showed a `session/title-llm-request` and no provider title: all five routed to `ark/ark-code-latest`, each fired 1–5 ms after the main request header on the same account, and each session's main loop carried that account's `RATE_LIMIT` (`RequestBurstTooFast` / `AccountQuotaExceeded`) or `TRANSPORT` failures — the auxiliary call has no retry and no fallback, so one rejected call left the deterministic fallback. The row now tries the resolved route first (session provider group's title pair → deployment-wide pair → the row's own pair → the session's logged route, deduplicated) and **only moves on after a failure**: a max-token failure gets one widened-budget retry on the same route (`min(4 × maxOutputTokens, 4096)`), other failures fall through to the next candidate, and when every candidate fails the row logs one warning naming the routes and rethrows, so the official fallback still applies. The configured route stays the first choice and nothing is persisted.
- **DSH 0.2.1 naming line (`executeSessionTitleLlm`).** `0.2.1-rc.2` removed `generateSessionTitleWithLlm` / `registerSessionTitleLlmProvider` and split the shared policy: the new `executeSessionTitleLlm(ctx, config, request, id, prepared)` returns assembled blocks plus the terminal finish reason, each provider owns its system instruction, input framing, reasoning-effort selection, and output interpretation, and `targetWords` / `targetCjkCharacters` moved into the provider's own config. The row detects the installed line at runtime and mirrors the shipped 0.2.1 provider exactly: same system instruction (including the best-effort line and, for all-prompts, the current-title stability rules anchored on a provider-sourced `currentTitle`), same JSON framing, the route's least supported reasoning effort, and the same finish-reason / whole-line-emphasis / empty-output acceptance rules. `cordis.patch.yml` also disables the `optional-session-title-all-prompts` row that 0.2.1's experimental session-titles bundle inserts (unknown-row warning on profiles without it, like the optional auto-review row).
- **DSH 0.2.1 compatibility review (0.2.0-rc.2 → 0.2.1-rc.2, public API only).**
  - **Naming:** the service keeps `register` / `ensureFallback` / the `first-prompt` gate and only adds an optional `currentTitle` to the provider request; `onMainRequest` dropped one boundary-freshness condition. The provider request shape this row returns is unchanged.
  - **Auto review:** the official gate now resolves the reviewing agent's directory through `ctx.workingDirectory.ensure(...)` and injects `workingDirectory`; `dsh-base` 0.2.1 mounts the `working-directory` row. **[Corrected in v0.4.28]** This entry originally claimed the official `apply` "runs unchanged under this row's scoped `llm`" on 0.2.1. It did not: the row called `apply` directly and mirrored the gate's services in its own `inject`, so the new `workingDirectory` read failed for every tool call. v0.4.28 mounts the gate as a plugin instead.
  - **Compaction and presets:** `dsh-compaction-basic` and `dsh-agent-preset` are byte-identical to 0.2.0, so the wholesale preset copies and the compaction engine need no re-sync.
  - **Unchanged surfaces this plugin calls:** `llm.stream(GenerateOptions)` (with `prepareCall` added beside it), `web.registerSearchProvider`, `tools/pre-execute` (`exec.agent` kept), session `snapshotEvents` / `requestHeader` / `requestContext` / `append`, and the composer's `conversation.input.model` seat.
  - **Subagents:** `@deepseek-ai/dsh-subagent` replaced `start()` / `startContinuable()` with `startActivation(spec)` plus a provider registry. The routed runtime therefore cannot override the new entry point; this row mounts the untouched official runtime (fail-closed) and logs one explicit notice. Recorded in `docs/seam-gap.md` for a later upstream proposal.
- **Verification.** `pnpm run check` green (`tsc` + `tsdown`, 52 test files / 437 tests, pack gate). New coverage: both auxiliary-LLM lines end to end, route-candidate ordering and dedup, max-token widening, fall-through, all-candidate failure reporting, cancelled requests staying silent, provider-prepared prompt/framing/anchor/effort selection, and the replaced-Subagent notice. Both official lines were also exercised end to end against the **real published packages** (0.2.1 `executeSessionTitleLlm`, 0.1.7 `generateSessionTitleWithLlm`): registration through the real policy validator, route selection, the `session/title-llm-request` record, the official system prompt, the least reasoning effort (0.2.1), and title acceptance all agree. **Lab plane:** `DSH_HOME=~/.dsh-lab` with the npm-installed `0.2.1-rc.2` runtime and the packed `dsh-model-switch-0.4.26.tgz` — profile composition `exit 0` with the naming, compaction, auto-review, and subagent rows composed from this plugin, and the Web Host booted on port 3082 serving the auth-gated page. **Residual (honest):** the 3082 capability RPC was not exercised from a browser (no browser automation is available in this environment), and the live desktop is still `0.2.0-rc.2`, so the 0.2.1 claim rests on the package-surface review, the unit suite, the real-package line checks, and the lab boot; the naming differential on a live 0.2.1 desktop is re-checked after the app update.
- **Post-release probe (2026-10-19 ~00:08 +0800, after the pinned Ark account's weekly quota reset).** The route was probed with the exact recorded system prompt and framed input. Before the reset it answered `HTTP 429 AccountQuotaExceeded`; with quota available the same route returns `finish: stop` and a complete title in 2.6–5.0 s with thinking enabled (57–134 reasoning tokens) versus 0.5–0.7 s and 6 tokens with thinking disabled. Tight budgets (`max_tokens` 8/16/24) still return a complete title, so truncation was not the observed failure mode — the route fall-through, not the widened retry, is the primary fix on this account. Evidence table and fix mapping in `docs/session-title-failure-mode.md`.

## v0.4.25

Three coordinated changes: Provider groups now cover all four per-session capabilities (compaction, auto review, session naming, and subagents) with mid-session provider-switch following; capability switches stay disabled until the model catalog has loaded (and while any row save is in flight) so clicks are never silently dropped; and send-time switch compaction (`compactOnSwitch` / `src/switch-compact.ts`) has been removed completely.

- **Provider groups cover compaction, auto review, session naming, and subagents per session.**
  - **Compaction (`src/compaction.ts`):** `mountEngine` mounts the official `BasicCompactionEngine` under `compactionScope(ctx)` (`ctx.extend({ llm: compactionLlm(...) })`). When `options.purpose === 'compaction'` and `options.sessionId` resolves to a session in `ctx.sessions`, `compactionLlm` derives the session's provider (`pending` selection preferred over `lastUsed`, then logged routes), resolves **provider group → flat compaction card → engine default**, and updates `options.provider` / `options.model` in place before delegating to `real.stream(options)`. Because `summarizeWithLlm` returns `{ provider: options.provider, model: options.model }`, the durable `compaction/summary` record always matches the exact model that wrote the summary, and edits to `providerGroups` apply to the very next compaction with zero engine remounts.
  - **Auto review (`src/auto-review.ts`):** Immediately after running `official.apply(scope)`, `bindAutoReviewSessionCorrelation` registers a `{ prepend: true }` `tools/pre-execute` listener on the review scope — which Cordis places ahead of the official gate's own prepended listener in the waterfall — and binds `exec.agent?.session` in an `AsyncLocalStorage` scope around `next()`. When `classifyRisk` calls `scope.llm.stream(options)`, the wrapper reads the active session, resolves **provider group → flat reviewer card → session model**, and passes a shallow copy of the frozen options with the resolved route. Parallel sessions on different providers therefore review on their own configured models without cross-session interference, and mid-session provider switches take effect on the very next review.
  - **Provider groups UI (`src/client/ModelSwitchSettings.tsx`):** Restored the **压缩模型 (`compaction`)** and **自动审查模型 (`autoReview`)** rows alongside **会话命名模型 (`sessionTitle`)** and **子代理默认路由 (`subagent`)** in the Provider groups card, seeded unsaved groups from all four active cards, and automatically reactivated stored `compactProvider`/`compactModel` and `autoReviewProvider`/`autoReviewModel` entries from v0.4.22/23 without migration.
- **Fixed intermittent unresponsive capability switches (`src/client/ModelSwitchSettings.tsx`).** Previously, clicking a capability switch (such as Session naming) before the async model catalog finished loading — or while another card's save was in flight — hit a silent `return` in `persist*Enabled` / `run()` while the `InstantSwitch` itself rendered enabled. Every switch's `disabled` prop now reflects `busy !== undefined`, `!writable`, `value === undefined`, and `catalogSeed === undefined` when enabling a seed-dependent route.
- **Removed send-time switch compaction (`compactOnSwitch` / `src/switch-compact.ts`).** Removed the Send protection (`发送保护` / `切换时压缩`) setting, UI section, and `agent/pre-step` hook. All compaction policy and triggers now belong exclusively to DSH's official compaction engine (`/compact` and automatic pressure/overflow compaction).

## v0.4.24

Three coordinated changes: session naming gains a configurable model; provider groups (and the Default Subagent route) become per-session derived policy instead of a write, fixing sessions on different providers overwriting or redirecting each other's auxiliary routes; and every settings row save becomes one atomic revision-fenced mutation, fixing the save-while-running freeze, half-written provider/model pairs, and the ambiguous ⚠ marker.

- **New: session-naming model card.** The settings page now configures the model behind DSH's automatic session titles. Off (both fields empty) is the official behavior — naming follows the session's own model; On pins a provider/model. The route is **read through on every naming request**, so a saved change applies to the very next title with no restart, and a naming request already in flight is never interrupted by a save. Each request resolves the session's provider group first, then the flat pair, then the session's own model, and the official implementation records the exact pair used in the session's own `session/title-llm-request` event — the durable record and the real request can never disagree. The plugin replaces the official `session-title-llm` row (the seam allows one registered naming provider per context) and mirrors the cadence that row declared; because a `disabled` row is not an instantiated loader entry, a profile where the displaced row cannot be inspected mirrors the shipped first-prompt cadence rather than dropping model-backed naming.
- **Provider groups are derived, not written (cross-session overwrite fixed).** Previously a provider switch *wrote* the group's routes into the shared deployment-wide fields, so two sessions on different providers could overwrite or redirect each other's auxiliary routes — a real cross-session hazard. Now a group saved for provider X merely applies to the sessions whose own provider is X: the Host resolves **group pair → flat deployment-wide pair → official default** per session and per request, and switching a session's provider writes NOTHING. The group editor therefore covers exactly the session-naming and subagent routes; auto review and compaction stay deployment-wide cards (the official auto-review gate exposes no session identity at its interception point, and the official compaction transaction durably records the provider/model that wrote its summary — both recorded in `docs/seam-gap.md`). The stored configuration format is unchanged and no migration runs: an older entry may still carry its compaction/auto-review fields, and they are ignored.
- **Subagent routing follows the delegating session.** A spawn that names no provider, model, or effort is routed with the delegating session's derived route (its provider group's subagent pair and effort, else the fixed card), so sessions on different providers route their own spawns. A caller that names a route is never overridden, and a provider whose capability is not `agentOptions` (for example a one-shot process adapter) is never reinterpreted as an Agent-capable route; with nothing pinning, the request stays untouched — official inherit (parent live request, then creation snapshot).
- **Compaction stays deployment-wide by design, with a supported per-route alternative.** The official compaction transaction durably records the provider/model that wrote the summary, so rewriting the summarization call per session would make that record false. A deployment that needs route-scoped summarization uses the official exact-target `modelPolicies` array on the profile's `compaction-basic` row config — each entry matches one exact routed conversation target and overrides its policy including the summarization pair, and this plugin forwards that row config verbatim (YAML example in the READMEs).
- **Atomic settings writes (freeze / half-pair / ⚠ fixed).** Every row save is now ONE atomic, revision-fenced mutation through the official ConfigForm `mutate`: a refused write can no longer leave a half-written provider/model pair. A draft the user edited survives external snapshot updates; a conflict is reported with a reload path instead of silently losing either side; and a write that never settles is reported after 30 seconds instead of freezing the page on "保存中…". The ⚠ marker now means only "this value is not in the current provider catalog".
- **The switch-time compaction guard is never dropped.** The send-time guard is installed *before* the previous one retires, and a refused registration is reported while the live guard stays in place, so a failed refresh can no longer leave a session without switch-time protection for its remaining steps.
- **Documentation.** The settings-page inventory is documented as shipped — Subagent, Web search, Image generation, Auto review, Compaction, and Session naming route cards plus the Provider groups card — in `README.md`, `README.zh.md`, and `PRODUCT.md`, with the two deployment-wide justifications and the `modelPolicies` alternative recorded in `docs/seam-gap.md`.

- **Verification.** `pnpm run check` green (`tsc` + `tsdown`, 53 test files / 425 tests, pack gate). Reverse verification: inverting the group-vs-deployment precedence turns the resolver spec red, removing the draft's pristine guard turns the external-snapshot spec red, and restoring the retire-then-install guard order turns the guard-lifecycle spec red — each green again after restore. Lab 3082 smoke: the naming card's save arrives as ONE `settings/mutate` carrying both `titleProvider` and `titleModel`, the group editor lists exactly the naming and subagent rows, and session naming was checked in both modes — card off produced a model-generated title within seconds, the card pinned to the keyless `deepseek-official` route produced no title across three sessions, and the same card pinned to a working route produced a model-generated title within seconds, which is the differential that shows the pinned route is the one the naming request uses. Residual: the `session/title-llm-request` field itself was not read (the session store's concatenated zstd frames could not be walked offline, and the trace view did not render the event), so the route match rests on that differential; compaction and auto review remain deployment-wide by design (`docs/seam-gap.md`).

## v0.4.23

Three coordinated changes: the Main-default card is removed entirely; provider groups now apply on every switch surface of the seat session; and the subagent summary distinguishes a pinned effort from a provider default.

- **Removed: the Main model card and its protection.** The settings page no longer configures the deployment default — the provider/model/effort card, `saveMain`, the `agent-default-model` client contract (`MAIN_DEFAULT_CONFIG_ID`, `MainSettingsView`, `MainSettingsConflictError`), the Host-side `mainDefaultPort`/`currentMainSelection`/`saveMainSelection` surface (and the runtime's `agentDefaultModel` inject), and the whole pre-switch capture / revision-fenced restore module (`main-default-restore.ts`, removed with its spec) are gone. The picker switch itself is now never gated on settings state (the previous writable-Main admission guard, including the non-loopback `settings.*` notices and the Plan Review card's settings-blocking path, is deleted). **Behavior and migration:** the plugin neither reads nor writes the deployment default; like a native TUI switch, a picker switch lets the Host's own default write take effect, so a new session starts on whatever was last used. To pin a fixed default, use DSH's own **Settings → Models** page. Remaining capability switches (auto review, compaction, subagent) seed their On state from the catalog head instead of Main, and the group editor's row-enable seeds from that capability's live route with the same catalog-head fallback. `PlanCommitOutcome` is now `{ committed }` only (plugin-internal, ships together).
- **Provider groups watch the session, not just the plugin.** A new watcher (`provider-group-watch.ts`, one per seat session, shared by both slot faces) observes the official model-selection directory projection — whose only `model/selection` emitter is the `session.selectModel` RPC — so the target provider's saved group now applies whenever **this session's model provider** changes, whether the switch came from this plugin's picker, the TUI, or another client. Semantics are unchanged: a provider without a group, a model-only change within one provider, and the subscription baseline write nothing; applies are serialized with coalescing to the latest target; a failed apply logs `dsh-model-switch: provider group apply failed` and never disturbs the switch. Residual boundary: the watcher exists only for sessions open in this Web UI. Settings copy reworded from "主模型切换" to "会话模型切换" (zh/en).
- **Subagent summary effort wording.** The Default Subagent route card now shows 「已固定 · High」 (locale `effortPinned` / `Pinned`) when an effort is stored and 「Provider 默认 · High」 when the route follows the provider default, with the effort rendered through the catalog's localized name (same lookup the picker uses) instead of the raw id. Previously every fixed route read "Provider 默认 · …" regardless.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 52 test files / 370 tests, pack gate); reverse verification — restoring the picker's inline group apply turns the watcher integration red, breaking the watcher baseline/coalescing turns exactly its unit spec red; lab 3082 smoke: the settings page shows no Main card, a picker provider switch still applies the stored group, a second browser tab switching the same session drives the first tab's cards to follow, the subagent summary reads 「已固定 · High」 when pinned and 「Provider 默认 · …」 when unset, group-less providers leave routes untouched, and switching is no longer blocked by settings state.

## v0.4.22

One addition: per-provider capability groups — save the compaction, subagent, and review routes together for a provider, and apply that group automatically when the main model's provider changes.

- **Provider groups.** New settings card (供应商配置组 / Provider groups) stores one route group per provider in the existing shared `model-switch` namespace (`providerGroups`, an entry array normalized to a provider map) covering exactly the three session-level capability routes — compaction, subagent, and auto review; search and image stay out of scope. Applying a group is a **full replacement** through one ordered write sequence: the pinned pairs are set, pairs the group does not pin are unset as a pair (never a half pair), and `subagentMode` is written last (`fixed` when the subagent pair is pinned — with its effort only when the effort is non-blank, blank meaning the provider default — else `follow-main`), so every unpinned capability reverts to its own default. Two plugin-owned switch surfaces trigger the apply: the composer picker's `directoryFace.select()` and the Main card's `saveMain()`, both gated on an actual provider change; a same-provider switch, a provider without a stored group, or any other switch surface (TUI) writes nothing. The apply rides the public ConfigForm `set`/`unset` onto the existing flat settings fields, so the consumers (`compaction.ts`, `subagent-runtime.ts`, `auto-review.ts`) are untouched, and the effect is profile-level like the fields it writes. Failures never fail the switch or the Main save: the picker logs a warning and still commits, while the Main card surfaces "Main model saved, but applying the provider group failed …". In the editor, a provider's draft seeds from the active routes the first time it is configured, each capability switch seeds from Main when turned on and stores the capability default when off, applying a group overwrites the three standalone cards (including manual edits, stated in the card copy), and **Delete group** removes the provider's entry (clearing the stored field when the last group goes, no-op when nothing is stored).
- **Storage and typing.** `providerGroups` is a `z.array(entry).default([]).volatile()` field on the exported `Config` (annotated explicitly so declaration emit stays inside this package), coerced per entry with `''` defaults; `normalizeProviderGroups` never throws, accepts both the stored entry array and a hand-written provider→routes record, drops blank fields, unknown fields, and blank/duplicate entries, and treats a literal `__proto__` provider id as data. `readConfig` omits the field when no group exists, keeping the exact empty-config shape unchanged.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 52 test files / 386 tests, pack gate); reverse verification — removing the picker's apply wiring turns exactly the adopt test red, green again after restore; lab 3082 smoke: two stored groups (one pinning compaction onto the keyless `deepseek-official` route, one onto a working route) apply on a picker provider switch (all three cards show the group values, switching back restores the previous routes), no-group providers leave the routes untouched, and `/compact` under the keyless pin fails with that route's `MISSING_CREDENTIAL` while the working group summarizes normally.

## v0.4.21

Two product changes and one investigation: plan-exit auto-compaction is removed entirely; official compaction (`/compact` and official automatic compaction) gains one configurable summarization model; and the "endless automatic compaction" reports are investigated and attributed to the official engine.

- **Removed: plan-exit compaction (0.4.20).** The plan-exit auto-compaction feature ships no more: the `plan-compact` plugin RPC endpoint, the Host runner, the card call, and the `planCompactThreshold` setting are gone, and plan approvals commit immediately as they did before 0.4.20. Switch-time compaction (`compactOnSwitch`, the fork's original send-time protection) is untouched and still optional.
- **Compaction model.** New settings card (default **off = official default = the conversation target model**; on seeds from Main) pins the summarization route for **all** official compaction — `/compact` and official automatic compaction alike. `dsh-model-switch/compaction` mounts the **same official `BasicCompactionEngine`** with the official row's own config forwarded unchanged and only `summarizationProvider`/`summarizationModel` overlaid when both settings fields are set (either field alone is ignored). Reaching the engine takes two row replacements: the top-level `compaction-basic` row (surfaces that compose the agent process-wide, e.g. the TUI) and — because the Web surface runs session compaction inside each agent preset's isolated `compaction` group, which profile patches cannot address — a wholesale replacement of the shipped preset rows (the Web preset editor's own save mechanism) that swaps that group's engine for the routed one; the preset copies are re-synced per DSH release during the existing compatibility verification. The engine remounts dispose-first whenever the composed config changes (`model-switch/settings-update`, emitted on ordinary and volatile saves; the listener is global so preset-realm instances hear it), and the initial mount is awaited so `/compact` resolves the service the moment the row completes. Failure ladder: configured route → official defaults → unmounted, each step with explicit errors. Saving while a compaction is running may interrupt it; it retries next time.
- **Known issue (upstream): official automatic compaction churns under sustained context pressure.** While the working set stays above the engine's pressure threshold (`thresholdRatio`, default `0.8 × target context window`), every `agent/pre-step` attempts compaction; once the remaining compactable ranges are small, the official "summary is not smaller than the shadowed content" guard rejects the summary and the next step retries the same range — a visible loop of automatic compactions. A session-level A/B pinned the source to the official engine, not this plugin: 180 compaction events in one session (62 rejected summaries, 1–2 attempts per step for hours), churn active only while the active model's window kept the threshold crossed, identical before and after disabling this plugin. Mitigations: set `auto: false` (keeps `/compact`) or raise `thresholdRatio` on the compaction-basic row config — this plugin forwards row config unchanged; reduce mounted tool schema; or pin a compaction model that produces leaner summaries. Recorded for upstream in `docs/seam-gap.md`.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 51 test files / 349 tests, pack gate); reverse verification — breaking the route overlay or the official-row forwarding turns the compaction tests red, then green again after restore; lab 3082 smoke with the shipped patch only: a keyless `compactProvider` pin makes `/compact` fail with that route's `MISSING_CREDENTIAL`, saving a working pin applies on the very next `/compact` without a restart, and an empty pair summarizes via the conversation target; auto-review runtime check on 3082: a pinned reviewer route receives the review call (tool bodies stay blocked when it fails), pin off reviews follow the session model.

## v0.4.20

Three coordinated additions: the Plan Review card shows only the official summary and restores the right-sidebar full-plan preview; the official Auto reviewer's model becomes configurable; and switching models at plan exit compacts long context first.

- **Plan Review body = summary, full plan in the sidebar.** The card renders the official two-part summary (`extractMarkdownPlainText` first-line + first-paragraph) instead of the whole document, with a "View full plan" header action. The full plan auto-opens in the right sidebar by driving ui-plan's registered preview opener: a composer-takeover entry cannot render `conversation.plan-review.actions` (one declarer per child slot, plus per-entry `renderSlot` authorization), so the card drives ui-plan's own inject face — address, params, logged-plan branch, and mounted-session gate all stay ui-plan's. `planReviewOf` now passes `intent.callId` through, matching the official narrow. Recorded in `docs/seam-gap.md`.
- **Auto review model.** New settings card (default **off = reviews follow the session model**; on seeds from Main) pins the reviewer route in the shared `model-switch` namespace. `cordis.patch.yml` disables the official `auto-review` row and inserts `dsh-model-switch/auto-review`, which runs the **same official `apply`** under a scoped child context whose `llm.stream` `provider/model` are rewritten only when both settings fields are set (identity passthrough otherwise, route re-read per call). The row mounts only when the profile started with the optional `@deepseek-ai/dsh-experimental-auto-review` bundle and reports an already-active official row instead of double-registering. Optional peer `@deepseek-ai/dsh-experimental-auto-review >=0.1.7-rc.2` (lowest verified; the devDep pins the matching 0.1.7-rc.2 line).
- **Plan-exit compaction.** When an approval switches provider/model and the estimated next request exceeds the new threshold (tokens, default 200,000, `0` disables, edited in the Send protection group), the card calls a new `plan-compact` plugin-RPC endpoint **before** committing anything: the Host prices the session with `ctx.tokenMeter` (larger of the two envelope prices) and, over threshold, summarizes once through an isolated `compaction-basic` engine pinned to the switched-to model via the turn-safe `compactIfNeeded(..., 'context-overflow')` — `exit_plan_mode` awaits its question inside a live tool call, so the idle-only `compactNow` cannot run at plan exit. Then the model commits and the review answers; **Set as goal and run** compacts before arming the goal. Same-model or effort-only approvals never trigger the endpoint, an empty history proceeds after a notice, and a failed compaction keeps the review pending and retryable. Seams and the borrowed overflow trigger are recorded in `docs/seam-gap.md`.
- Verification: `pnpm run check` green (`tsc` + `tsdown`, 50 test files / 348 tests, pack gate); reverse verification — restoring the full-plan body, removing the switch gate, and dropping the route rewrite each turn the targeted tests red, then green again after restore.

## v0.4.19

Plan Review gains a **Set as goal and run** action: it arms the reviewed Plan as the session's goal and only then answers it, so `dsh-goal-round-driver` carries the Plan after plan mode exits.

- The goal is set before the answer, matching the card's existing commit-then-answer order; a refusal keeps the review pending and reports the Host's own wire code.
- An unfinished goal is replaced through `get` + `clear` + `create` rather than edited, so a new Plan starts with a fresh round cap, and the card says it replaced the previous goal.
- The goal face is resolved per render (`ctx.get('remote.goals', false)`) instead of listed in the static client `inject`, so a deployment that mounts no `@deepseek-ai/dsh-goal` keeps loading this plugin and the action disables itself with an explicit reason while the other three actions keep working. `@deepseek-ai/dsh-goal` is declared as an optional peer.
- The objective is the Plan's trimmed markdown. The plugin stores no goal state, owns no part of the goal domain, and schedules no rounds.
- Records the seam in `docs/seam-gap.md` (the released `remote.goals.create` exists while DSH's own goal surface deliberately omits creation) and the action in PRODUCT.md and both READMEs.

## v0.4.18

Declare official DSH `0.2.0-rc.2` compatible in `package.json#dsh.compatibility.dshReleases`.

Evidence, in the order this repository's compatibility policy requires:

- **Public API review:** the 0.2.x Host renamed the pending-question withdrawal verb (`PendingQuestion.cancel()` → `dismiss()`), fires `session.selectModel`'s deployment-default write without awaiting it, and reports a refused `ModelDirectory.select` as a returned `{ ok: false }` value instead of throwing. Each difference broke v0.4.16, and each is fixed in v0.4.17.
- **Tests and build:** `pnpm run check` green — `tsc` + `tsdown`, the full vitest suite, and the pack gate against a real tarball.
- **Lab plane:** profile composition `exit 0` with no skipped bundle, Host boot on port 3082 with the plugin's capability RPC answering, and the npm-installed build booting on port 3085 with its client bundle served.
- **Live desktop verification on 0.2.0-rc.2:** all three Plan Review actions exercised against a real session — Discuss withdraws the takeover and returns the composer; Reject delivers typed feedback verbatim as the answer's `custom` text; Confirm commits a different execution model, approves the plan, and restores the Main default to its pre-switch value.

## v0.4.17

First release published to the npm registry, so `dsh plugin --profile <name> add dsh-model-switch` installs prebuilt code without a git build authorization. Publishing builds `lib/` through `prepublishOnly`, and `pnpm run check` now runs its pack gate on Windows as well.

- Plan Review **Discuss in chat** now withdraws the takeover through the verb the running Host publishes (`PendingQuestion.dismiss()` on 0.2.x, `cancel()` on 0.1.x) instead of calling `cancel()` unconditionally, which threw on a Host that renamed it; a Host exposing neither is named explicitly.
- Plan Review **Reject** sends text from the card's feedback field as the answer's `custom` text, so a rejection reaches the model with what to change instead of a bare option label.
- Compensate the deployment default through the namespace revision actually observed: wait for the Host's unawaited `session.selectModel` default write, fence on the observed revision, retry once against a concurrent edit, and never fail the answer. The previous `captured + 1` fence assumed an awaiting Host and could either refuse the restore (leaving the Plan unanswerable) or silently leave the Main default switched.
- Treat a refused official `ModelDirectory.select` result as an uncommitted model change instead of reporting success.
- Keep Confirm and Reject closed after a settled review while Discuss and a reload affordance stay reachable, and surface the wire code of a failed action.
- Fix a line-ending fragile mobile width-budget assertion.
- Make the pack gate portable: resolve npm's own CLI when a shell-less spawn cannot launch the Windows `.cmd` shim, compare archive members across line endings, and link the extracted package with a junction on Windows.

## v0.4.16

- Bundle shared Provider UI helpers from the published v0.2.14 release.
- Apply the official menu backdrop material and preserve picker focus through model selection, pane changes, and search dismissal.
- Keep search autofocus and return focus to the trigger when Escape closes the summary.
- Verify official DSH 0.1.7-rc.2 with open-ended Host dependency ranges.

## v0.4.15

Accept DSH releases from 0.1.7-alpha.2 onward through open-ended peer and development ranges. Rebuild and verify against official 0.1.7-rc.1 without changing model routing behavior.

## v0.4.14

Target official DSH `0.1.7-alpha.2`, pin Provider UI `0.2.12`, and move Main, Subagent, search, image, and compaction controls to published ConfigForms. On non-loopback browsers the official forms are memory-only: Settings shows an explicit unavailable state and the picker refuses selections that would otherwise persist a deployment-wide default without a safe restoration path.

## v0.4.13

Replacement Subagent runtime exposes public `resolveMaxDepth` so Host 0.1.6-alpha.2 Standard remount keeps Model Switch routing. Compile target stays `0.1.5-rc.1`.

## v0.4.12

Optional Default Subagent route (Official inherit when off) and Switch compaction as a Send protection B-row.

## v0.4.11

Rank live catalogRoutes. Compact-on-switch uses previous-provider usage when present.

# Changelog

## [0.4.10] - 2026-09-13

- Include completion notices in the send-time budget; verify concurrent sessions, retained-input retry, live progress, and durable notice replay through the real agent loop.
- On send, when the assembled target model or context-tier id differs from the last request, check the pending request against the target window and compact once with the previous model if needed. Picker-only changes do no work. Default on; Settings → Model Switch can turn it off without disabling DSH automatic compaction.
- DSH Host packages are no longer version-locked. `@deepseek-ai/dsh-*` peers are `*` and optional; unknown Hosts warn once and still mount. Cordis stays `>=4.0.2 <5.0.0`. Compile-target `devDependencies` remain `0.1.5-rc.1`.
- Keep Fast / Context / Thinking / Effort switches on the current Agent after a turn; disable unpublished sibling rows instead of ignoring clicks.
- Composer picker Cursor mark comes from `dsh-llm-providers-ui` 0.2.6.

## [0.4.9] - 2026-09-09

- Reserve the selected execution runtime as soon as a prompt is submitted, before the first token or native binding.
- Native Antigravity keeps its models and effort; DSH keeps LLM-provider choices and disables Agent providers until cancel or a durable native binding.

## [0.4.8] - 2026-09-07

- Development dependency now points at the final `dsh-llm-providers-ui` 0.1.10 release URL with pinned integrity; Alpha.4 fixtures updated coherently (roots + provider identity + fresh self-root tarball).

## [0.4.7] - 2026-09-06

- Unify provider-owned independent Web search metadata and execution for DeepSeek, Codex and Grok through the existing adapter registry and authenticated capability RPC.
- Reuse official DeepSeek search settings/credentials and preserve the deployment’s complete Web config, including fetchProvider. Global search routing remains an explicit opt-in with no silent fallback.
- Recover capability polling after transient failures and Host revision resets; skip unchanged heartbeats without hiding unload warnings or enabling stale saves.
- Preserve Antigravity session routing and released v0.4.6 runtime compatibility; correct picker test fixtures without weakening approval safety assertions.
- Coordinate with Codex 0.3.14, Grok 0.3.11 and Provider Directory 0.1.9; install and validate immutable packages in lab before production promotion.

## [0.4.6] - 2026-09-03

### Changed

- DSH compatibility declarations cover the verified Alpha.4 and rc.1 runtimes.
- Unknown runtimes warn once and use the normal best-effort mount path; only reproduced failures may be blocklisted.


## 0.4.2

- Settings → LLM Providers: drag cards to reorder; chat picker follows `llm-providers.order` via dsh-llm-providers-ui.


## 0.4.3

- Keep a Host-accepted composer selection visible while its durable Session projection catches up, then return authority to newer projected selections.

## 0.4.1 - 2026-08-29

- Support DSH 0.1.2-alpha.1 through the public Cordis, Settings, Remote, Session, and Model Directory services after the monolithic client runtime removal.
- Carry fixed Subagent reasoning effort on alpha.1.
- Let the composer model trigger use the full available seat width on mobile instead of clipping long model labels.
- Keep Composer and Plan model switches session-local with a revision-fenced Main-default restore where the Host couples session selection to deployment defaults.
- Publish bilingual product documentation and screenshots, including the provider-catalog rules for custom Picker families.

## 0.3.11 - 2026-08-27

- Lock the real composer UI path for independent Context 1M and Fast On selection: when the provider catalog publishes a combined `*-1m-fast` row, the picker preserves both dimensions and submits that exact model id.
- Document through regression evidence that providers must publish the combined row; separate `*-1m` and `*-fast` rows cannot represent both dimensions simultaneously.

## 0.3.10 - 2026-08-27

- Keep mobile picker triggers, headings, model names, catalog descriptions, and values readable by rendering and wrapping instead of truncating.
- Resolve optional mobile interaction operations only through Cordis's typed public non-strict service lookup.
- Consolidate each picker snapshot and its operations into one render view backed by the official directory status/routability contract, retaining selected routes absent from the advisory catalog.
- Isolate popup activation, positioning, and dismissal in a deep internal module.
- Keep composer and Plan Review picker crashes mounted as localized, retryable diagnostics.
- Preserve Plan Review's one-row mobile footer while shrinking controls and wrapping action labels inside their buttons at narrow widths.

## 0.3.9 - 2026-08-27

- Preserve the 320px preferred picker width whenever the mobile viewport allows it, shifting away from the trigger instead of squeezing to 240px.
- Hide horizontal list overflow while retaining vertical scrolling, removing the mobile horizontal scrollbar.

## 0.3.8 - 2026-08-27

- Keep a mobile pointer's open/close intent idempotent through the 750ms tap-fallback window so a detail-zero programmatic click cannot reopen a picker that the user just closed.

## 0.3.7 - 2026-08-27

- Make click the sole owner of picker toggle state so one mobile touch cannot open on pointerdown and immediately close on its synthetic click.

## 0.3.6 - 2026-08-27

- Restore non-strict lookup for the optional mobile interaction service; Cordis may reject direct undeclared-property access, which previously crashed the custom seat on render.

## 0.3.5 - 2026-08-27

- Declare the merged picker's Sessions and model-directory services in the client plugin's top-level injection contract so production completes the custom seat registration.

## 0.3.4 - 2026-08-27

- Contain composer-seat render/effect errors inside the merged picker so a crash cannot silently abdicate to the official picker; show a retryable diagnostic instead.
- Treat the Sessions face as optional while the public model-directory service gate is active.

## 0.3.3 - 2026-08-27

- Restore merged picker ownership of the composer model seat by matching the official service gate and using an unambiguous winning priority.
- Treat optional mobile interaction-surface failures as a graceful degradation instead of crashing and abdicating the custom seat to the official picker.

## 0.3.2 - 2026-08-27

- Match Model Switch route cards to the shared LLM Providers chrome: radius, fill, border, spacing, icon treatment, title weight, summary size, chevron, and expanded body.

## 0.3.1 - 2026-08-27

- Keep the Model Switch settings nav glyph after the official Settings shell redraws its SVG.
- Restore a visible platform-gray fill for collapsed route cards; every route remains collapsed on mount.

## 0.3.0 - 2026-08-27

- Absorb the composer model picker and Plan Review execution picker into this package.
- Plan Review uses the official warn-strip card, a short capsule trigger, and a two-level Model/Effort/Context/Fast/Thinking menu.
- One `dsh plugin add dsh-model-switch` now covers routing Settings and composer/Plan selection. Remove a standalone `dsh-composer-picker` install to avoid a second model seat.
- Picker trigger shows the family name plus distinct effort / Fast / context bits; duplicate context windows collapse to one menu row.
- Known limitations: Settings nav icon still patches official nav DOM (no public icon field, same pattern as usage-monitor).

## 0.2.0 - 2026-08-26

- Keep official `web_search` ownership and add a thin `model-switch` Web Search provider with Codex model routing.
- Add stable `generate_image` routing through optional Codex and Grok adapters, with provider-specific schemas regenerated after Image route changes.
- Add Search and Image settings cards while keeping Vision/read_image excluded.
- Preserve existing provider-specific image tools and `web_fetch` as rollback paths.


## 0.1.1 - 2026-08-26

- Ship compiled Host/Client `lib/` in the git tag so `github:…#v0.1.1` installs can boot.

## 0.1.0 - 2026-08-26

- Add Main default and follow-main/fixed Subagent model routing for DSH 0.1.1-rc.2.
- Resolve follow-main from the active parent request header before stale session options.
- Preserve inherited provider/model when rc.2 cannot carry reasoning effort.
- Leave Search, Vision, image reading, ordinary chat attachments, and image generation on their existing official/provider paths.
- Add localized Model Switch settings and clean plugin lifecycle integration.
- Keep ordinary chat attachments on the official DSH path.
