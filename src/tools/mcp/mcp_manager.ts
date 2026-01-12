import { Config } from "../../config/config.js";
import { ToolRegistry } from "../registry.js";
import { MCPClient, MCPServerStatus } from "./client.js";
import { MCPTool } from "./mcp_tool.js";

export interface MCPHealthStatus {
  name: string;
  status: MCPServerStatus;
  tools: number;
  lastCheck: Date;
  error?: string;
}

export class MCPManager {
  private config: Config;
  private clients: Map<string, MCPClient> = new Map();
  private initialized: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthStatuses: Map<string, MCPHealthStatus> = new Map();

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const mcpConfigs = this.config.mcpServers || {};

    if (Object.keys(mcpConfigs).length === 0) {
      this.initialized = true;
      return;
    }

    // Create clients for enabled servers
    for (const [name, serverConfig] of Object.entries(mcpConfigs)) {
      if (!serverConfig.enabled) {
        continue;
      }

      const client = new MCPClient(name, serverConfig, this.config.cwd);
      this.clients.set(name, client);
    }

    // Connect to all servers in parallel
    const connectionTasks = Array.from(this.clients.entries()).map(
      async ([name, client]) => {
        try {
          await Promise.race([
            client.connect(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Connection timeout for ${name}`)),
                (client.config.startupTimeoutSec || 10) * 1000
              )
            ),
          ]);
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          console.error(`[warn]Failed to connect to MCP server '${name}': ${errorMsg}[/warn]`);
          // Continue even if some servers fail - this is expected behavior
        }
      }
    );

    await Promise.allSettled(connectionTasks);
    this.initialized = true;
    
    // Start health check if enabled
    this.startHealthCheck();
  }

  private startHealthCheck(): void {
    // Health check every 60 seconds
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth().catch((error) => {
        if (this.config.debug) {
          console.error(`[debug]Health check error: ${error}`);
        }
      });
    }, 60000); // Check every 60 seconds
    
    // Initial health check
    this.checkHealth().catch(() => {
      // Ignore initial errors
    });
  }

  private async checkHealth(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      const status: MCPHealthStatus = {
        name,
        status: client.status,
        tools: client.toolList.length,
        lastCheck: new Date(),
      };

      // If disconnected, try to reconnect
      if (client.status === MCPServerStatus.DISCONNECTED || 
          client.status === MCPServerStatus.ERROR) {
        try {
          await client.connect();
          status.status = client.status;
        } catch (error: any) {
          status.status = MCPServerStatus.ERROR;
          status.error = error?.message || String(error);
        }
      }

      this.healthStatuses.set(name, status);
    }
  }

  getHealthStatuses(): MCPHealthStatus[] {
    return Array.from(this.healthStatuses.values());
  }

  async checkServerHealth(name: string): Promise<MCPHealthStatus | null> {
    const client = this.clients.get(name);
    if (!client) {
      return null;
    }

    const status: MCPHealthStatus = {
      name,
      status: client.status,
      tools: client.toolList.length,
      lastCheck: new Date(),
    };

    // Try to reconnect if disconnected
    if (client.status !== MCPServerStatus.CONNECTED) {
      try {
        await client.connect();
        status.status = client.status;
      } catch (error: any) {
        status.status = MCPServerStatus.ERROR;
        status.error = error?.message || String(error);
      }
    }

    this.healthStatuses.set(name, status);
    return status;
  }

  registerTools(registry: ToolRegistry): number {
    let count = 0;

    for (const client of this.clients.values()) {
      if (client.status !== MCPServerStatus.CONNECTED) {
        continue;
      }

      for (const toolInfo of client.toolList) {
        const mcpTool = new MCPTool(
          this.config,
          client,
          toolInfo,
          `${client.name}__${toolInfo.name}`
        );
        registry.registerMcpTool(mcpTool);
        count++;
      }
    }

    return count;
  }

  async shutdown(): Promise<void> {
    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const disconnectionTasks = Array.from(this.clients.values()).map(
      async (client) => {
        try {
          await client.disconnect();
        } catch (error) {
          // Ignore errors during shutdown
        }
      }
    );

    await Promise.allSettled(disconnectionTasks);
    this.clients.clear();
    this.healthStatuses.clear();
    this.initialized = false;
  }

  getAllServers(): Array<{
    name: string;
    status: string;
    tools: number;
  }> {
    const servers: Array<{ name: string; status: string; tools: number }> = [];

    for (const [name, client] of this.clients.entries()) {
      servers.push({
        name,
        status: client.status,
        tools: client.toolList.length,
      });
    }

    return servers;
  }
}
