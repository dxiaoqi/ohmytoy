import { LLMClient } from "../client/llm_client.js";
import { StreamEventType, TokenUsage } from "../client/response.js";
import { ContextManager } from "./manager.js";
import { getCompressionPrompt } from "../prompts/system.js";

export class ChatCompactor {
  constructor(private client: LLMClient) {}

  private formatHistoryForCompaction(
    messages: Array<Record<string, any>>
  ): string {
    const output: string[] = [
      "Here is the conversation that needs to be continue: \n",
    ];

    for (const msg of messages) {
      const role = msg.role || "";
      const content = msg.content || "";

      if (role === "system") {
        continue;
      }

      if (role === "tool") {
        const toolId = msg.tool_call_id || "unknown";
        const truncated =
          content.length > 2000 ? content.substring(0, 2000) : content;
        const suffix = content.length > 2000 ? "\n... [tool output truncated]" : "";
        output.push(`[Tool Result (${toolId})]:\n${truncated}${suffix}`);
      } else if (role === "assistant") {
        const toolDetails: string[] = [];
        if (content) {
          const truncated =
            content.length > 3000 ? content.substring(0, 3000) : content;
          const suffix = content.length > 3000 ? "\n... [response truncated]" : "";
          output.push(`Assistant:\n${truncated}${suffix}`);
        }

        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const func = tc.function || {};
            const name = func.name || "unknown";
            let args = func.arguments || "{}";
            if (typeof args === "string" && args.length > 500) {
              args = args.substring(0, 500);
            }
            toolDetails.push(`  - ${name}(${args})`);
          }
          output.push("Assistant called tools:\n" + toolDetails.join("\n"));
        }
      } else {
        const truncated =
          content.length > 1500 ? content.substring(0, 1500) : content;
        const suffix = content.length > 1500 ? "\n... [message truncated]" : "";
        output.push(`User:\n${truncated}${suffix}`);
      }
    }

    return output.join("\n\n---\n\n");
  }

  async compress(
    contextManager: ContextManager
  ): Promise<[string | null, TokenUsage | null]> {
    const messages = contextManager.getMessages();

    if (messages.length < 3) {
      return [null, null];
    }

    const compressionMessages = [
      {
        role: "system",
        content: getCompressionPrompt(),
      },
      {
        role: "user",
        content: this.formatHistoryForCompaction(messages),
      },
    ];

    try {
      let summary = "";
      let usage: TokenUsage | null = null;

      for await (const event of this.client.chatCompletion(
        compressionMessages,
        null,
        false
      )) {
        if (event.type === StreamEventType.MESSAGE_COMPLETE) {
          usage = event.usage || null;
          if (event.textDelta) {
            summary += event.textDelta.content;
          }
        }
      }

      if (!summary || !usage) {
        return [null, null];
      }

      return [summary, usage];
    } catch {
      return [null, null];
    }
  }
}
