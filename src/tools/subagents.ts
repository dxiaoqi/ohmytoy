import { Config, createConfig } from "../config/config.js";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "./base.js";
import { z } from "zod";
import { Agent } from "../agent/agent.js";
import { AgentEventType } from "../agent/events.js";

const SubagentParamsSchema = z.object({
  goal: z.string().describe("The specific task or goal for the subagent to accomplish"),
});

export interface SubagentDefinition {
  name: string;
  description: string;
  goalPrompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutSeconds?: number;
}

export class SubagentTool extends Tool {
  public definition: SubagentDefinition;

  constructor(config: Config, definition: SubagentDefinition) {
    super(config);
    this.definition = definition;
  }

  get name(): string {
    return `subagent_${this.definition.name}`;
  }

  get description(): string {
    return this.definition.description;
  }

  get schema(): z.ZodType<any> {
    return SubagentParamsSchema;
  }

  isMutating(_params: Record<string, any>): boolean {
    return true;
  }

  kind = ToolKind.MEMORY; // Subagents don't mutate files directly

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = SubagentParamsSchema.parse(invocation.params);
    
    if (!params.goal) {
      return ToolResult.errorResult("No goal specified for sub-agent");
    }

    // Create a modified config for the subagent
    const configData: any = {
      ...this.config,
      maxTurns: this.definition.maxTurns || 20,
    };
    if (this.definition.allowedTools) {
      configData.allowedTools = this.definition.allowedTools;
    }
    const subagentConfig = createConfig(configData);

    const prompt = `You are a specialized sub-agent with a specific task to complete.

${this.definition.goalPrompt}

YOUR TASK:
${params.goal}

IMPORTANT:
- Focus only on completing the specified task
- Do not engage in unrelated actions
- Once you have completed the task or have the answer, provide your final response
- Be concise and direct in your output
`;

    const toolCalls: string[] = [];
    let finalResponse: string | null = null;
    let error: string | null = null;
    let terminateResponse = "goal";

    try {
      const agent = new Agent(subagentConfig);
      await agent.initialize();

      const deadline = Date.now() + (this.definition.timeoutSeconds || 600) * 1000;

      try {
        for await (const event of agent.run(prompt)) {
          if (Date.now() > deadline) {
            terminateResponse = "timeout";
            finalResponse = "Sub-agent timed out";
            break;
          }

          if (event.type === AgentEventType.TOOL_CALL_START) {
            toolCalls.push(event.data.name);
          } else if (event.type === AgentEventType.TEXT_COMPLETE) {
            finalResponse = event.data.content;
          } else if (event.type === AgentEventType.AGENT_END) {
            if (finalResponse === null) {
              finalResponse = event.data.response || null;
            }
          } else if (event.type === AgentEventType.AGENT_ERROR) {
            terminateResponse = "error";
            error = event.data.error || "Unknown";
            finalResponse = `Sub-agent error: ${error}`;
            break;
          }
        }
      } finally {
        await agent.close();
      }
    } catch (e) {
      terminateResponse = "error";
      error = String(e);
      finalResponse = `Sub-agent failed: ${e}`;
    }

    const result = `Sub-agent '${this.definition.name}' completed.
Termination: ${terminateResponse}
Tools called: ${toolCalls.length > 0 ? toolCalls.join(", ") : "None"}

Result:
${finalResponse || "No response"}
`;

    if (error) {
      return ToolResult.errorResult(result);
    }

    return ToolResult.successResult(result);
  }
}

export const CODEBASE_INVESTIGATOR: SubagentDefinition = {
  name: "codebase_investigator",
  description: "Investigates the codebase to answer questions about code structure, patterns, and implementations",
  goalPrompt: `You are a codebase investigation specialist.
Your job is to explore and understand code to answer questions.
Use read_file, grep, glob, and list_dir to investigate.
Do NOT modify any files.`,
  allowedTools: ["read_file", "grep", "glob", "list_dir"],
};

export const CODE_REVIEWER: SubagentDefinition = {
  name: "code_reviewer",
  description: "Reviews code changes and provides feedback on quality, bugs, and improvements",
  goalPrompt: `You are a code review specialist.
Your job is to review code and provide constructive feedback.
Look for bugs, code smells, security issues, and improvement opportunities.
Use read_file, list_dir and grep to examine the code.
Do NOT modify any files.`,
  allowedTools: ["read_file", "grep", "list_dir"],
  maxTurns: 10,
  timeoutSeconds: 300,
};

export function getDefaultSubagentDefinitions(): SubagentDefinition[] {
  return [CODEBASE_INVESTIGATOR, CODE_REVIEWER];
}
