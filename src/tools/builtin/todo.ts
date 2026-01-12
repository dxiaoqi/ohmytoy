import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { Config } from "../../config/config.js";

const TodosParamsSchema = z.object({
  action: z.enum(["add", "complete", "list", "clear"]).describe("Action: 'add', 'complete', 'list', 'clear'"),
  id: z.string().optional().describe("Todo ID (for complete)"),
  content: z.string().optional().describe("Todo content (for add)"),
});

export class TodosTool extends Tool {
  name = "todos";
  description = "Manage a task list for the current session. Use this to track progress on multi-step tasks.";
  kind = ToolKind.MEMORY;
  schema = TodosParamsSchema;
  private todos: Map<string, string> = new Map();

  constructor(config: Config) {
    super(config);
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = TodosParamsSchema.parse(invocation.params);

    if (params.action === "add") {
      if (!params.content) {
        return ToolResult.errorResult("`content` required for 'add' action");
      }
      const todoId = this.generateId();
      this.todos.set(todoId, params.content);
      return ToolResult.successResult(`Added todo [${todoId}]: ${params.content}`);
    } else if (params.action === "complete") {
      if (!params.id) {
        return ToolResult.errorResult("`id` required for 'complete' action");
      }
      if (!this.todos.has(params.id)) {
        return ToolResult.errorResult(`Todo not found: ${params.id}`);
      }

      const content = this.todos.get(params.id)!;
      this.todos.delete(params.id);
      return ToolResult.successResult(`Completed todo [${params.id}]: ${content}`);
    } else if (params.action === "list") {
      if (this.todos.size === 0) {
        return ToolResult.successResult("No todos");
      }
      const lines = ["Todos:"];

      for (const [todoId, content] of this.todos.entries()) {
        lines.push(`  [${todoId}] ${content}`);
      }
      return ToolResult.successResult(lines.join("\n"));
    } else if (params.action === "clear") {
      const count = this.todos.size;
      this.todos.clear();
      return ToolResult.successResult(`Cleared ${count} todos`);
    } else {
      return ToolResult.errorResult(`Unknown action: ${params.action}`);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
