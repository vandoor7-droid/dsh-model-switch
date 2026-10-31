import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Config, readConfig, type Config as ModelSwitchSettingsConfig, type ModelSwitchSettings } from './host-settings.js'
import { RUNTIME_CAPABILITIES } from './runtime-capabilities.js'
import { autoReviewStatus } from './auto-review.js'
import { ModelSwitchAdapterRegistry } from './adapter-registry.js'
import { installModelSwitchSearchProvider } from './search-provider.js'
import { installGenerateImageTool } from './image-tool.js'
import { installCapabilitiesRpc } from './capabilities-rpc.js'
import { installDeepSeekSearchAdapter } from './deepseek-search-adapter.js'
import { allowDshRuntime } from './compatibility.js'
import { bridgeAgentPresets } from './preset-sync.js'

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
    return {
      ...RUNTIME_CAPABILITIES,
      searchProviderAdapters: { available: true, providers: catalog.map(provider => provider.id), catalog },
      autoReview: autoReviewStatus.held ? { available: true } : { available: false, reason: 'auto-review-takeover' as const },
    }
  }
  readonly adapters = new ModelSwitchAdapterRegistry()
  private source: () => ModelSwitchSettings

  constructor(ctx: Context, entry: ModelSwitchSettingsConfig) {
    super(ctx, 'modelSwitch')
    this.source = () => readConfig(entry)
    // Everything after the service registration is best-effort: a throwing
    // installer must not fail the row, because a failed row is disposed and its
    // `modelSwitch` service goes with it — every dependent row then sits in
    // `pending (waiting for service: modelSwitch)` forever instead of booting.
    try {
      ctx.inject(['settings'], scope => scope.effect(
        () => scope.settings.configure({ auto: false }, ctx.fiber),
        'Model Switch: disable automatic settings form',
      ))
      if (!allowDshRuntime(ctx.logger, 'dsh-model-switch', ['@deepseek-ai/dsh-agent'])) return
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
      void bridgeAgentPresets(ctx)
        .then(bridged => {
          if (bridged.length > 0) ctx.logger.info(`model-switch: bridged agent preset compaction rows (${bridged.join(', ')})`)
        })
        .catch(error => ctx.logger.warn(`model-switch: agent preset bridge failed: ${String(error)}`))
    } catch (error) {
      ctx.logger.error('Model Switch: the host runtime could not finish installing; the modelSwitch service stays registered so dependent rows keep loading')
      ctx.logger.error(error)
    }
  }

  currentSettings(): ModelSwitchSettings { return { ...this.source() } }
}
