import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { MCPServerConfig } from "../../config/config.js";

export enum MCPServerStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  serverName: string;
}

export class MCPClient {
  public name: string;
  public config: MCPServerConfig;
  public cwd: string;
  public status: MCPServerStatus = MCPServerStatus.DISCONNECTED;
  private client: Client | null = null;
  private tools: Map<string, MCPToolInfo> = new Map();

  constructor(name: string, config: MCPServerConfig, cwd: string) {
    this.name = name;
    this.config = config;
    this.cwd = cwd;
  }

  get toolList(): MCPToolInfo[] {
    return Array.from(this.tools.values());
  }

  private async createTransport(): Promise<StdioClientTransport | SSEClientTransport> {
    if (this.config.command) {
      // Stdio transport
      const env: Record<string, string> = {};
      // Copy process.env, filtering out undefined values
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      // Override with config env
      for (const [key, value] of Object.entries(this.config.env || {})) {
        env[key] = value;
      }
      
      const command = this.config.command;
      const args = this.config.args || [];
      
      const transport = new StdioClientTransport({
        command,
        args,
        env,
      });
      
      return transport;
    } else if (this.config.url) {
      // SSE transport
      const transport = new SSEClientTransport(new URL(this.config.url));
      return transport;
    } else {
      throw new Error("MCP Server must have either 'command' (stdio) or 'url' (http/sse)");
    }
  }

  async connect(): Promise<void> {
    if (this.status === MCPServerStatus.CONNECTED) {
      return;
    }

    this.status = MCPServerStatus.CONNECTING;

    try {
      const transport = await this.createTransport();
      this.client = new Client(
        {
          name: "ai-coding-agent",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(transport);

      // List tools
      const toolsResult = await this.client.listTools();
      
      for (const tool of toolsResult.tools) {
        this.tools.set(tool.name, {
          name: tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema || {},
          serverName: this.name,
        });
      }

      this.status = MCPServerStatus.CONNECTED;
    } catch (error: any) {
      this.status = MCPServerStatus.ERROR;
      const errorMsg = error?.message || String(error);
      // Re-throw with more context
      throw new Error(`MCP server '${this.name}' connection failed: ${errorMsg}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore errors during disconnect
      }
      this.client = null;
    }

    this.tools.clear();
    this.status = MCPServerStatus.DISCONNECTED;
  }

  async callTool(toolName: string, arguments_: Record<string, any>): Promise<{
    output: string;
    isError: boolean;
  }> {
    if (!this.client || this.status !== MCPServerStatus.CONNECTED) {
      throw new Error(`Not connected to server ${this.name}`);
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: arguments_,
      });

      const output: string[] = [];
      const content = result.content as Array<{ type?: string; text?: string }>;
      for (const item of content) {
        if (item.type === "text" && item.text) {
          output.push(item.text);
        } else {
          output.push(JSON.stringify(item));
        }
      }

      return {
        output: output.join("\n"),
        isError: Boolean(result.isError),
      };
    } catch (error) {
      return {
        output: `MCP tool call failed: ${error}`,
        isError: true,
      };
    }
  }
}
