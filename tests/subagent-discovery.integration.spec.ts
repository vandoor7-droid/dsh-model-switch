import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import ToolsService, { defineTool } from '@deepseek-ai/dsh-tools'
import profileSubagentRuntime from '../src/subagent-runtime.js'

/** ToolsService injects the system-prompt surface; a stub satisfies it. */
class TestSystemPrompt extends Service {
  constructor(ctx: Context) { super(ctx, 'systemPrompt') }
  tools(): () => void { return () => undefined }
}

/** The real registry, a sibling-registered discovery tool, and our row on top. */
describe('subagent model discovery hint against the real tools registry', () => {
  it('appends the route footer to a sibling-registered list_subagent_models', async () => {
    const ctx = new Context()
    await ctx.plugin(TestSystemPrompt)
    await ctx.plugin(ToolsService)
    const definition = defineTool({
      name: 'list_subagent_models',
      description: 'test double for the official discovery tool',
      parameters: {},
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async () => 'apigoto — apigoto',
    })
    ctx.tools.register(definition)
    await ctx.plugin(profileSubagentRuntime)

    const wrapped = ctx.tools.get('list_subagent_models')
    expect(wrapped).toBeDefined()
    const session = { requestContext: () => ({ provider: 'apigoto', model: 'm1' }), requestHeader: () => undefined }
    const output = await wrapped!.execute({}, { agent: { session } } as never)
    expect(output).toBe('apigoto — apigoto\nDefault route for spawns that name no provider/model (Model Switch): official inherit (nothing pinned).')
  })

  it('picks up a tool registered after the row applied (tools/change)', async () => {
    const ctx = new Context()
    await ctx.plugin(TestSystemPrompt)
    await ctx.plugin(ToolsService)
    await ctx.plugin(profileSubagentRuntime)
    const definition = defineTool({
      name: 'list_subagent_models',
      description: 'test double for the official discovery tool',
      parameters: {},
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async () => 'apigoto — apigoto',
    })
    ctx.tools.register(definition)
    await new Promise(resolve => setTimeout(resolve, 50))
    const session = { requestContext: () => ({ provider: 'apigoto', model: 'm1' }), requestHeader: () => undefined }
    const output = await ctx.tools.get('list_subagent_models')!.execute({}, { agent: { session } } as never)
    expect(output).toContain('Default route for spawns that name no provider/model (Model Switch): official inherit (nothing pinned).')
  })

  it('wraps a tool registered from a SIBLING plugin context (loader-row topology)', async () => {
    const ctx = new Context()
    await ctx.plugin(TestSystemPrompt)
    await ctx.plugin(ToolsService)
    const definition = defineTool({
      name: 'list_subagent_models',
      description: 'test double for the official discovery tool',
      parameters: {},
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async () => 'apigoto — apigoto',
    })
    // A sibling plugin context, like a loader-composed row, owns the registration.
    await ctx.plugin({ name: 'fake-official-row', inject: ['tools'], apply: (rowCtx: Context) => { rowCtx.tools.register(definition) } } as never)
    await ctx.plugin(profileSubagentRuntime)
    const session = { requestContext: () => ({ provider: 'apigoto', model: 'm1' }), requestHeader: () => undefined }
    const output = await ctx.tools.get('list_subagent_models')!.execute({}, { agent: { session } } as never)
    expect(output).toContain('Default route for spawns that name no provider/model')
  })

  it('restores the official execute when the row unloads', async () => {
    const ctx = new Context()
    await ctx.plugin(TestSystemPrompt)
    await ctx.plugin(ToolsService)
    const definition = defineTool({
      name: 'list_subagent_models',
      description: 'test double for the official discovery tool',
      parameters: {},
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async () => 'apigoto — apigoto',
    })
    ctx.tools.register(definition)
    const fiber = await ctx.plugin(profileSubagentRuntime)
    const session = { requestContext: () => ({ provider: 'apigoto', model: 'm1' }), requestHeader: () => undefined }
    expect(await ctx.tools.get('list_subagent_models')!.execute({}, { agent: { session } } as never))
      .toContain('Default route for spawns')
    await fiber.dispose()
    expect(await ctx.tools.get('list_subagent_models')!.execute({}, { agent: { session } } as never))
      .toBe('apigoto — apigoto')
  })
})
