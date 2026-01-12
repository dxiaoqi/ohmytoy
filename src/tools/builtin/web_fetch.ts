import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";

const WebFetchParamsSchema = z.object({
  url: z.string().url().describe("URL to fetch (must be http:// or https://)"),
  timeout: z.number().int().min(5).max(120).default(30).describe("Request timeout in seconds (default: 30)"),
});

export class WebFetchTool extends Tool {
  name = "web_fetch";
  description = "Fetch content from a URL. Returns the response body as text";
  kind = ToolKind.NETWORK;
  schema = WebFetchParamsSchema;

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = WebFetchParamsSchema.parse(invocation.params);

    const url = new URL(params.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return ToolResult.errorResult("URL must be http:// or https://");
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), params.timeout * 1000);

      const response = await fetch(params.url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AI-Agent/1.0)",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return ToolResult.errorResult(
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const text = await response.text();

      let output = text;
      if (text.length > 100 * 1024) {
        output = text.substring(0, 100 * 1024) + "\n... [content truncated]";
      }

      return ToolResult.successResult(output, {
        status_code: response.status,
        content_length: text.length,
      });
    } catch (error: any) {
      if (error.name === "AbortError") {
        return ToolResult.errorResult(
          `Request timed out after ${params.timeout}s`
        );
      }
      return ToolResult.errorResult(`Request failed: ${error.message || error}`);
    }
  }
}
