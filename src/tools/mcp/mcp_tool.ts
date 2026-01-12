import { Config } from "../../config/config.js";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { MCPClient, MCPToolInfo } from "./client.js";

export class MCPTool extends Tool {
  private toolInfo: MCPToolInfo;
  private client: MCPClient;
  public name: string;
  public description: string;

  constructor(
    config: Config,
    client: MCPClient,
    toolInfo: MCPToolInfo,
    name: string
  ) {
    super(config);
    this.toolInfo = toolInfo;
    this.client = client;
    this.name = name;
    this.description = toolInfo.description;
  }

  get schema(): Record<string, any> {
    const inputSchema = this.toolInfo.inputSchema || {};
    return {
      type: "object",
      properties: inputSchema.properties || {},
      required: inputSchema.required || [],
    };
  }

  isMutating(_params: Record<string, any>): boolean {
    return true;
  }

  kind = ToolKind.MCP;

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(
        this.toolInfo.name,
        invocation.params
      );

      if (result.isError) {
        return ToolResult.errorResult(result.output);
      }

      return ToolResult.successResult(result.output);
    } catch (error) {
      return ToolResult.errorResult(`MCP tool failed: ${error}`);
    }
  }
}
