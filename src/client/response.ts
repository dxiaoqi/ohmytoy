export class TextDelta {
  constructor(public content: string) {}

  toString(): string {
    return this.content;
  }
}

export enum StreamEventType {
  TEXT_DELTA = "text_delta",
  MESSAGE_COMPLETE = "message_complete",
  ERROR = "error",
  TOOL_CALL_START = "tool_call_start",
  TOOL_CALL_DELTA = "tool_call_delta",
  TOOL_CALL_COMPLETE = "tool_call_complete",
}

export class TokenUsage {
  constructor(
    public promptTokens: number = 0,
    public completionTokens: number = 0,
    public totalTokens: number = 0,
    public cachedTokens: number = 0
  ) {}

  add(other: TokenUsage): TokenUsage {
    return new TokenUsage(
      this.promptTokens + other.promptTokens,
      this.completionTokens + other.completionTokens,
      this.totalTokens + other.totalTokens,
      this.cachedTokens + other.cachedTokens
    );
  }
}

export class ToolCallDelta {
  constructor(
    public callId: string,
    public name?: string,
    public argumentsDelta: string = ""
  ) {}
}

export class ToolCall {
  constructor(
    public callId: string,
    public name?: string,
    public args: Record<string, any> = {}
  ) {}
}

export class StreamEvent {
  constructor(
    public type: StreamEventType,
    public textDelta?: TextDelta,
    public error?: string,
    public finishReason?: string,
    public toolCallDelta?: ToolCallDelta,
    public toolCall?: ToolCall,
    public usage?: TokenUsage
  ) {}
}

export class ToolResultMessage {
  constructor(
    public toolCallId: string,
    public content: string,
    public isError: boolean = false
  ) {}

  toOpenAIMessage(): Record<string, any> {
    return {
      role: "tool",
      tool_call_id: this.toolCallId,
      content: this.content,
    };
  }
}

export function parseToolCallArguments(
  argumentsStr: string
): Record<string, any> {
  if (!argumentsStr) {
    return {};
  }

  try {
    return JSON.parse(argumentsStr);
  } catch {
    return { raw_arguments: argumentsStr };
  }
}
