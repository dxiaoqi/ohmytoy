import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";

const WebSearchParamsSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().int().min(1).max(20).default(10).describe("Maximum results to return (default: 10)"),
});

export class WebSearchTool extends Tool {
  name = "web_search";
  description = "Search the web for information. Returns search results with titles, URLs and snippets";
  kind = ToolKind.NETWORK;
  schema = WebSearchParamsSchema;

  async execute(_invocation: ToolInvocation): Promise<ToolResult> {
    // Note: This is a placeholder implementation
    // In production, you would use a web search API like:
    // - DuckDuckGo API (duck-duck-scraper)
    // - Google Custom Search API
    // - SerpAPI
    // - etc.

    return ToolResult.errorResult(
      "Web search is not yet implemented. Please use web_fetch to access specific URLs."
    );
  }
}
