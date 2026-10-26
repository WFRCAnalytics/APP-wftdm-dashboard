// 064-ai-chat-assistant: the real dependencies behind the agent loop. The UI calls this; tests call runAgent with fakes.
import { buildCatalog, catalogText } from './catalog.ts'
import { runAgent, type AgentDeps, type AgentResult, type AgentRun } from './agentLoop.ts'
import { complete } from './providers.ts'
import { dispatchTool } from './tools.ts'

const deps: AgentDeps = {
  complete,
  dispatch: dispatchTool,
  catalog: () => catalogText(buildCatalog()),
}

export function askAssistant(run: AgentRun): Promise<AgentResult> {
  return runAgent(run, deps)
}
