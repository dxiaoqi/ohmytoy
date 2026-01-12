import OpenAI from "openai";
import {
  StreamEvent,
  StreamEventType,
  TextDelta,
  TokenUsage,
  ToolCall,
  ToolCallDelta,
  parseToolCallArguments,
} from "./response.js";
import { Config } from "../config/config.js";

export class LLMClient {
  private client: OpenAI | null = null;
  private readonly maxRetries: number = 3;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
      });
    }
    return this.client;
  }

  async close(): Promise<void> {
    if (this.client) {
      // OpenAI SDK doesn't have explicit close, but we can nullify
      this.client = null;
    }
  }

  private buildTools(tools: Array<Record<string, any>>): Array<any> {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters:
          tool.parameters ||
          ({
            type: "object",
            properties: {},
          } as any),
      },
    }));
  }

  async *chatCompletion(
    messages: Array<Record<string, any>>,
    tools?: Array<Record<string, any>> | null,
    stream: boolean = true
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const client = this.getClient();

    const kwargs: any = {
      model: this.config.modelName,
      messages,
      stream,
    };

    if (tools) {
      kwargs.tools = this.buildTools(tools);
      kwargs.tool_choice = "auto";
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (stream) {
          yield* this.streamResponse(client, kwargs);
        } else {
          const event = await this.nonStreamResponse(client, kwargs);
          yield event;
        }
        return;
      } catch (error: any) {
        if (error.status === 429 && attempt < this.maxRetries) {
          // Rate limit error
          const waitTime = Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
          continue;
        } else if (error.type === "connection_error" && attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
          continue;
        } else {
          yield new StreamEvent(
            StreamEventType.ERROR,
            undefined,
            `API error: ${error.message || error}`
          );
          return;
        }
      }
    }
  }

  private async *streamResponse(
    client: OpenAI,
    kwargs: any
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const stream = await client.chat.completions.create(kwargs) as any;

    let finishReason: string | undefined;
    let usage: TokenUsage | undefined;
    const toolCalls: Map<number, any> = new Map();

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = new TokenUsage(
          chunk.usage.prompt_tokens,
          chunk.usage.completion_tokens,
          chunk.usage.total_tokens,
          (chunk.usage as any).prompt_tokens_details?.cached_tokens || 0
        );
      }

      if (!chunk.choices || chunk.choices.length === 0) {
        continue;
      }

      const choice = chunk.choices[0];
      const delta = choice.delta;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (delta.content) {
        yield new StreamEvent(
          StreamEventType.TEXT_DELTA,
          new TextDelta(delta.content)
        );
      }

      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const idx = toolCallDelta.index;

          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, {
              id: toolCallDelta.id || "",
              name: "",
              arguments: "",
            });

            if (toolCallDelta.function?.name) {
              toolCalls.get(idx)!.name = toolCallDelta.function.name;
              yield new StreamEvent(
                StreamEventType.TOOL_CALL_START,
                undefined,
                undefined,
                undefined,
                new ToolCallDelta(toolCalls.get(idx)!.id, toolCallDelta.function.name)
              );
            }
          }

          if (toolCallDelta.function?.arguments) {
            toolCalls.get(idx)!.arguments += toolCallDelta.function.arguments;
            yield new StreamEvent(
              StreamEventType.TOOL_CALL_DELTA,
              undefined,
              undefined,
              undefined,
              new ToolCallDelta(
                toolCalls.get(idx)!.id,
                toolCallDelta.function.name,
                toolCallDelta.function.arguments
              )
            );
          }
        }
      }
    }

    for (const [, tc] of toolCalls) {
      yield new StreamEvent(
        StreamEventType.TOOL_CALL_COMPLETE,
        undefined,
        undefined,
        undefined,
        undefined,
        new ToolCall(
          tc.id,
          tc.name,
          parseToolCallArguments(tc.arguments || "")
        )
      );
    }

    yield new StreamEvent(
      StreamEventType.MESSAGE_COMPLETE,
      undefined,
      undefined,
      finishReason,
      undefined,
      undefined,
      usage
    );
  }

  private async nonStreamResponse(
    client: OpenAI,
    kwargs: any
  ): Promise<StreamEvent> {
    const response = await client.chat.completions.create({
      ...kwargs,
      stream: false,
    });

    const choice = response.choices[0];
    const message = choice.message;

    let textDelta: TextDelta | undefined;
    if (message.content) {
      textDelta = new TextDelta(message.content);
    }

    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push(
        new ToolCall(
          tc.id,
          tc.function.name,
          parseToolCallArguments(tc.function.arguments || "")
        )
        );
      }
    }

    let usage: TokenUsage | undefined;
    if (response.usage) {
      usage = new TokenUsage(
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        response.usage.total_tokens,
        (response.usage as any).prompt_tokens_details?.cached_tokens || 0
      );
    }

    return new StreamEvent(
      StreamEventType.MESSAGE_COMPLETE,
      textDelta,
      undefined,
      choice.finish_reason || undefined,
      undefined,
      toolCalls.length > 0 ? toolCalls[0] : undefined,
      usage
    );
  }
}
