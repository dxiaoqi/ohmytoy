import { LLMClient } from "../client/llm_client.js";
import { Config } from "../config/config.js";
import { getDataDir } from "../config/loader.js";
import { ChatCompactor } from "../context/compaction.js";
import { LoopDetector } from "../context/loop_detector.js";
import { ContextManager } from "../context/manager.js";
import { HookSystem } from "../hooks/hook_system.js";
import { ApprovalManager } from "../safety/approval.js";
import { ToolRegistry, createDefaultRegistry } from "../tools/registry.js";
import { MCPManager } from "../tools/mcp/mcp_manager.js";
import { ToolDiscoveryManager } from "../tools/discovery.js";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export class Session {
  public client: LLMClient;
  public toolRegistry: ToolRegistry;
  public contextManager: ContextManager | null = null;
  public mcpManager: MCPManager;
  public discoveryManager: ToolDiscoveryManager;
  public chatCompactor: ChatCompactor;
  public approvalManager: ApprovalManager;
  public loopDetector: LoopDetector;
  public hookSystem: HookSystem;
  public sessionId: string;
  public createdAt: Date;
  public updatedAt: Date;
  public turnCount: number = 0;

  constructor(public config: Config) {
    this.client = new LLMClient(config);
    this.toolRegistry = createDefaultRegistry(config);
    this.mcpManager = new MCPManager(config);
    this.discoveryManager = new ToolDiscoveryManager(config, this.toolRegistry);
    this.chatCompactor = new ChatCompactor(this.client);
    this.approvalManager = new ApprovalManager(
      config.approval,
      config.cwd
    );
    this.loopDetector = new LoopDetector();
    this.hookSystem = new HookSystem(config);
    this.sessionId = this.generateUUID();
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  async initialize(): Promise<void> {
    // Initialize MCP manager
    await this.mcpManager.initialize();
    this.mcpManager.registerTools(this.toolRegistry);

    // Tool discovery
    await this.discoveryManager.discoverAll();

    this.contextManager = new ContextManager(
      this.config,
      this.loadMemory(),
      this.toolRegistry.getTools()
    );
  }

  async reloadTools(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Reload discovered tools
      await this.discoveryManager.reload();
      
      // Update context manager with new tools
      if (this.contextManager) {
        this.contextManager = new ContextManager(
          this.config,
          this.loadMemory(),
          this.toolRegistry.getTools()
        );
      }
      
      return { success: true, errors: [] };
    } catch (error: any) {
      errors.push(error?.message || String(error));
      return { success: false, errors };
    }
  }

  private loadMemory(): string | null {
    const dataDir = getDataDir();
    try {
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      const path = join(dataDir, "user_memory.json");

      if (!existsSync(path)) {
        return null;
      }

      const content = readFileSync(path, "utf-8");
      const data = JSON.parse(content);
      const entries = data.entries;

      if (!entries || Object.keys(entries).length === 0) {
        return null;
      }

      const lines = ["User preferences and notes:"];
      for (const [key, value] of Object.entries(entries)) {
        lines.push(`- ${key}: ${value}`);
      }

      return lines.join("\n");
    } catch {
      return null;
    }
  }

  incrementTurn(): number {
    this.turnCount++;
    this.updatedAt = new Date();
    return this.turnCount;
  }

  getStats(): Record<string, any> {
    return {
      session_id: this.sessionId,
      created_at: this.createdAt.toISOString(),
      turn_count: this.turnCount,
      message_count: this.contextManager?.messageCount || 0,
      token_usage: this.contextManager?.totalUsage || {},
      tools_count: this.toolRegistry.getTools().length,
      mcp_servers: this.toolRegistry.connectedMcpServers.length,
    };
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
