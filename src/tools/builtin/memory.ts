import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { getDataDir } from "../../config/loader.js";

const MemoryParamsSchema = z.object({
  action: z.enum(["set", "get", "delete", "list", "clear"]).describe("Action: 'set', 'get', 'delete', 'list', 'clear'"),
  key: z.string().optional().describe("Memory key (required for `set`, `get`, `delete`)"),
  value: z.string().optional().describe("Value to store (required for `set`)"),
});

export class MemoryTool extends Tool {
  name = "memory";
  description = "Store and retrieve persistent memory. Use this to remember user preferences, important context or notes.";
  kind = ToolKind.MEMORY;
  schema = MemoryParamsSchema;

  private loadMemory(): Record<string, any> {
    const dataDir = getDataDir();
    try {
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      const path = join(dataDir, "user_memory.json");

      if (!existsSync(path)) {
        return { entries: {} };
      }

      const content = readFileSync(path, "utf-8");
      return JSON.parse(content);
    } catch {
      return { entries: {} };
    }
  }

  private saveMemory(memory: Record<string, any>): void {
    const dataDir = getDataDir();
    try {
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      const path = join(dataDir, "user_memory.json");

      writeFileSync(path, JSON.stringify(memory, null, 2), "utf-8");
    } catch (error) {
      // Ignore save errors
    }
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = MemoryParamsSchema.parse(invocation.params);

    if (params.action === "set") {
      if (!params.key || !params.value) {
        return ToolResult.errorResult(
          "`key` and `value` are required for 'set' action"
        );
      }
      const memory = this.loadMemory();
      if (!memory.entries) {
        memory.entries = {};
      }
      memory.entries[params.key] = params.value;
      this.saveMemory(memory);

      return ToolResult.successResult(`Set memory: ${params.key}`);
    } else if (params.action === "get") {
      if (!params.key) {
        return ToolResult.errorResult("`key` required for 'get' action");
      }

      const memory = this.loadMemory();
      if (!memory.entries || !(params.key in memory.entries)) {
        return ToolResult.successResult(
          `Memory not found: ${params.key}`,
          { found: false }
        );
      }
      return ToolResult.successResult(
        `Memory found: ${params.key}: ${memory.entries[params.key]}`,
        { found: true }
      );
    } else if (params.action === "delete") {
      if (!params.key) {
        return ToolResult.errorResult("`key` required for 'delete' action");
      }
      const memory = this.loadMemory();
      if (!memory.entries || !(params.key in memory.entries)) {
        return ToolResult.successResult(`Memory not found: ${params.key}`);
      }

      delete memory.entries[params.key];
      this.saveMemory(memory);

      return ToolResult.successResult(`Deleted memory: ${params.key}`);
    } else if (params.action === "list") {
      const memory = this.loadMemory();
      const entries = memory.entries || {};
      if (Object.keys(entries).length === 0) {
        return ToolResult.successResult("No memories stored", { found: false });
      }
      const lines = ["Stored memories:"];
      for (const [key, value] of Object.entries(entries).sort()) {
        lines.push(`  ${key}: ${value}`);
      }

      return ToolResult.successResult(lines.join("\n"), { found: true });
    } else if (params.action === "clear") {
      const memory = this.loadMemory();
      const count = Object.keys(memory.entries || {}).length;
      memory.entries = {};
      this.saveMemory(memory);
      return ToolResult.successResult(`Cleared ${count} memory entries`);
    } else {
      return ToolResult.errorResult(`Unknown action: ${params.action}`);
    }
  }
}
