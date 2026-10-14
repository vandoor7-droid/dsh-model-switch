import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Config, readConfig, type Config as ModelSwitchSettingsConfig, type ModelSwitchSettings } from './host-settings.js'
import { RUNTIME_CAPABILITIES } from './runtime-capabilities.js'
import { ModelSwitchAdapterRegistry } from './adapter-registry.js'
import { installModelSwitchSearchProvider } from './search-provider.js'
import { installGenerateImageTool } from './image-tool.js'
import { installCapabilitiesRpc } from './capabilities-rpc.js'
import { installDeepSeekSearchAdapter } from './deepseek-search-adapter.js'
import { allowDshRuntime } from './compatibility.js'
import { installSwitchCompaction } from './switch-compact.js'

declare module '@deepseek-ai/cordis' {
  interface Context { modelSwitch: ModelSwitchRuntime }
  interface Events {
    /** Model Switch settings changed; reread via `modelSwitch.currentSettings()`. */
    'model-switch/settings-update'(): void
  }
}

/** Host owner for Model Switch settings. */
export class ModelSwitchRuntime extends Service {
  static Config = Config
  get capabilities() {
    const catalog = this.adapters.searchCatalog()
    return { ...RUNTIME_CAPABILITIES, searchProviderAdapters: { available: true, providers: catalog.map(provider => provider.id), catalog } }
  }
  readonly adapters = new ModelSwitchAdapterRegistry()
  private source: () => ModelSwitchSettings

  constructor(ctx: Context, entry: ModelSwitchSettingsConfig) {
    super(ctx, 'modelSwitch')
    this.source = () => readConfig(entry)
    ctx.inject(['settings'], scope => scope.effect(
      () => scope.settings.configure({ auto: false }, ctx.fiber),
      'Model Switch: disable automatic settings form',
    ))
    if (!allowDshRuntime(ctx.logger, 'dsh-model-switch', ['@deepseek-ai/dsh-agent'])) return
    installSwitchCompaction(ctx, () => this.source(), provider => this.adapters.get(provider)?.role)
    installDeepSeekSearchAdapter(ctx)
    installModelSwitchSearchProvider(ctx, this)
    installCapabilitiesRpc(ctx, this.adapters, () => this.capabilities)
    const imageTool = installGenerateImageTool(ctx, this)
    ctx.on('loader/volatile-update', () => {
      void imageTool.reconcile().catch(error => {
        ctx.logger.error('Model Switch: failed to regenerate generate_image schema')
        ctx.logger.error(error)
      })
      ctx.emit('model-switch/settings-update')
    })
    ctx.emit('model-switch/settings-update')
  }

  currentSettings(): ModelSwitchSettings { return { ...this.source() } }
}
