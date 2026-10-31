# 补丁层是整键替换，不是深合并（2026-10-31）

DSH 把 profile 组成一棵插件行树：先按 `dsh.profile.bundles` 依次应用每个 bundle 的
`cordis.patch.yml`，最后应用 profile 自己的 `cordis.patch.yml`（以及启动参数里的额外 patch）。
应用逻辑在 `@deepseek-ai/dsh-app-boot` 的 `applyEntryPatches`：

```js
for (const [key, value] of Object.entries(overrides)) {
  if (key === 'id') continue
  target[key] = value          // 整键替换
}
```

也就是说，后一层补丁里出现 `- id: permission` + `config:` 时，命中行的**整份 `config`**
会被新对象替换——不会与前一层已经补进去的键做深合并。

## 踩过的例子：Auto mode 从权限选择器消失

`@log.li/dsh-automode` 的 bundle patch 会给 `permission` 行补一份 `config.presets`
（内置三个预设 + `auto-mode`）。如果 profile 自己的补丁里也有一条 `- id: permission`
（例如早先为了让设置界面的「默认权限」有处落笔而加的），它那份只列三个内置预设的
`config` 会整份覆盖掉 bundle 的版本，`auto-mode` 预设随之消失，权限选择器里就只剩下
三个模式——而 automode 插件的行本身仍然正常挂载，看起来像"插件没生效"。

### 两条可行的修法

1. **别自己重写 `config`**：删掉 profile 里那条 `permission` 行，让 bundle 的预设保持生效。
   `dsh-config-editor` 在目标行不存在时会**自动把整行写进** profile 补丁
   （`edit()` 里 `if (index < 0) document.add({ id, name, config: next })`），所以改「默认权限」
   仍然能保存；首次写入时会把当时组合出的完整预设（含 `auto-mode`）一起固化下来。
2. **重写就写全**：保留 profile 的 `permission` 行，但把 `auto-mode` 预设
   （`sandbox` / `approval` / `name` / `description` / `icon`）原样补进 `config.presets`，
   与 automode bundle 的定义保持一致。

本仓库的 `status.automode.preset`（`present | missing | unknown`）会读出组合后的
`permission` 行并检查 `auto-mode` 键，缺失时打一条 warn；升级 automode 后先看这个字段，
能立刻区分"行没挂载"和"预设被覆盖"。

## 同类风险

任何"bundle 补里加键、profile 补丁里也写同一行 `config`"的组合都遵循这条规则。
排查此类问题最快的方式是用 lab profile 跑一次
`dsh --profile <name> --dump-config`，直接看最终组合出的那一段
（桌面 profile 被 Electron 独占时该命令会拒绝执行，需要在 lab 里复现同样的层叠）。

## 运行期改这一行会把服务改没（2026-10-31 观察）

补充一条与上面无关、但同一条 `permission` 行上的运行期现象：

- 在**已经运行**的宿主里改动 profile 的 `permission` 行（改 `config`、删掉整行、甚至补上
  显式 `name` 强制重新挂载），热重载后可能出现：
  `gateway/service-unavailable: typert gateway: permissionPresets/catalog:
  active Service "permissionPresets" is unavailable`
  ——设置界面「通用设置 → 权限」显示「不可用」，对话界面的权限选择器整块消失。
- 把行改回原样、把四个预设补全、加 `name:` 触发重挂载，都**没能**让服务恢复；
  同一份配置在 lab 冷启动则正常。也就是说运行期的这一行一旦失败，重载不会把它救回来。
- 处置：保证 profile 补丁里这一行是最终想要的形态（四个预设 + `defaultPreset`），
  然后**重启宿主**让它从冷启动重新组合；重启后再看「通用设置 → 权限」是否列出四个模式。
- 冷启动仍失败时，下一步要看宿主启动日志里该行的 apply 异常（例如
  `permission: the mounted bash executor does not confine` /
  `permission: composed sandbox and approval defaults match no preset`），
  这两条都来自 `@deepseek-ai/dsh-permission-presets` 构造期校验。

