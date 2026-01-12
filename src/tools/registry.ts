import { Config } from "../config/config.js";
import { Tool, ToolInvocation, ToolResult } from "./base.js";
import { getAllBuiltinTools } from "./builtin/index.js";
import { ApprovalManager, ApprovalContext, ApprovalDecision } from "../safety/approval.js";
import { HookSystem } from "../hooks/hook_system.js";
import { getDefaultSubagentDefinitions, SubagentTool } from "./subagents.js";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private mcpTools: Map<string, Tool> = new Map();
  private discoveredTools: Map<string, Tool> = new Map(); // Track discovered tools
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  get connectedMcpServers(): Tool[] {
    return Array.from(this.mcpTools.values());
  }

  register(tool: Tool, isDiscovered: boolean = false): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    if (isDiscovered) {
      this.discoveredTools.set(tool.name, tool);
    }
  }

  unregisterDiscovered(name: string): boolean {
    if (this.discoveredTools.has(name)) {
      this.discoveredTools.delete(name);
      return this.tools.delete(name);
    }
    return false;
  }

  reloadDiscoveredTools(newTools: Tool[]): void {
    // Remove old discovered tools
    for (const [name] of this.discoveredTools.entries()) {
      this.tools.delete(name);
    }
    this.discoveredTools.clear();

    // Register new discovered tools
    for (const tool of newTools) {
      this.register(tool, true);
    }
  }

  registerMcpTool(tool: Tool): void {
    this.mcpTools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool | null {
    if (this.tools.has(name)) {
      return this.tools.get(name)!;
    }
    if (this.mcpTools.has(name)) {
      return this.mcpTools.get(name)!;
    }
    return null;
  }

  getTools(): Tool[] {
    const tools: Tool[] = [];
    tools.push(...this.tools.values());
    tools.push(...this.mcpTools.values());

    if (this.config.allowedTools) {
      const allowedSet = new Set(this.config.allowedTools);
      return tools.filter((t) => allowedSet.has(t.name));
    }

    return tools;
  }

  getDiscoveredTools(): Tool[] {
    return Array.from(this.discoveredTools.values());
  }

  getSchemas(): Array<Record<string, any>> {
    return this.getTools().map((tool) => tool.toOpenAISchema());
  }

  async invoke(
    name: string,
    params: Record<string, any>,
    cwd: string,
    hookSystem: HookSystem,
    approvalManager?: ApprovalManager | null
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      const result = ToolResult.errorResult(
        `Unknown tool: ${name}`,
        "",
        { tool_name: name }
      );
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    }

    const validationErrors = tool.validateParams(params);
    if (validationErrors.length > 0) {
      const result = ToolResult.errorResult(
        `Invalid parameters: ${validationErrors.join("; ")}`,
        "",
        {
          tool_name: name,
          validation_errors: validationErrors,
        }
      );
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    }

    await hookSystem.triggerBeforeTool(name, params);
    const invocation = new ToolInvocation(params, cwd);

    if (approvalManager) {
      const confirmation = await tool.getConfirmation(invocation);
      if (confirmation) {
        const context = new ApprovalContext(
          name,
          params,
          tool.isMutating(params),
          confirmation.affectedPaths,
          confirmation.command,
          confirmation.isDangerous
        );

        const decision = await approvalManager.checkApproval(context);
        if (decision === ApprovalDecision.REJECTED) {
          const result = ToolResult.errorResult(
            "Operation rejected by safety policy"
          );
          await hookSystem.triggerAfterTool(name, params, result);
          return result;
        } else if (decision === ApprovalDecision.NEEDS_CONFIRMATION) {
          const approved = await approvalManager.requestConfirmation(confirmation);

          if (!approved) {
            const result = ToolResult.errorResult("User rejected the operation");
            await hookSystem.triggerAfterTool(name, params, result);
            return result;
          }
        }
      }
    }

    try {
      const result = await tool.execute(invocation);
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    } catch (error: any) {
      console.error(`Tool ${name} raised unexpected error`, error);
      const result = ToolResult.errorResult(
        `Internal error: ${error.message || String(error)}`,
        "",
        { tool_name: name }
      );
      await hookSystem.triggerAfterTool(name, params, result);
      return result;
    }
  }
}

export function createDefaultRegistry(config: Config): ToolRegistry {
  const registry = new ToolRegistry(config);

  for (const ToolClass of getAllBuiltinTools()) {
    registry.register(new ToolClass(config));
  }

  // Add default subagent tools
  for (const subagentDef of getDefaultSubagentDefinitions()) {
    registry.register(new SubagentTool(config, subagentDef));
  }

  // Add custom subagent tools from config
  if (config.subagents && config.subagents.length > 0) {
    for (const subagentConfig of config.subagents) {
      const subagentDef = {
        name: subagentConfig.name,
        description: subagentConfig.description,
        goalPrompt: subagentConfig.goalPrompt,
        allowedTools: subagentConfig.allowedTools,
        maxTurns: subagentConfig.maxTurns,
        timeoutSeconds: subagentConfig.timeoutSeconds,
      };
      registry.register(new SubagentTool(config, subagentDef));
    }
  }

  return registry;
}
