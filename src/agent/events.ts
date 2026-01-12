import { TokenUsage } from "../client/response.js";
import { ToolResult } from "../tools/base.js";

export enum AgentEventType {
  AGENT_START = "agent_start",
  AGENT_END = "agent_end",
  AGENT_ERROR = "agent_error",
  TOOL_CALL_START = "tool_call_start",
  TOOL_CALL_COMPLETE = "tool_call_complete",
  TEXT_DELTA = "text_delta",
  TEXT_COMPLETE = "text_complete",
}

export class AgentEvent {
  constructor(
    public type: AgentEventType,
    public data: Record<string, any> = {}
  ) {}

  static agentStart(message: string): AgentEvent {
    return new AgentEvent(AgentEventType.AGENT_START, { message });
  }

  static agentEnd(
    response?: string | null,
    usage?: TokenUsage | null
  ): AgentEvent {
    return new AgentEvent(AgentEventType.AGENT_END, {
      response,
      usage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            cachedTokens: usage.cachedTokens,
          }
        : null,
    });
  }

  static agentError(
    error: string,
    details?: Record<string, any> | null
  ): AgentEvent {
    return new AgentEvent(AgentEventType.AGENT_ERROR, {
      error,
      details: details || {},
    });
  }

  static textDelta(content: string): AgentEvent {
    return new AgentEvent(AgentEventType.TEXT_DELTA, { content });
  }

  static textComplete(content: string): AgentEvent {
    return new AgentEvent(AgentEventType.TEXT_COMPLETE, { content });
  }

  static toolCallStart(
    callId: string,
    name: string,
    arguments_: Record<string, any>
  ): AgentEvent {
    return new AgentEvent(AgentEventType.TOOL_CALL_START, {
      call_id: callId,
      name,
      arguments: arguments_,
    });
  }

  static toolCallComplete(
    callId: string,
    name: string,
    result: ToolResult
  ): AgentEvent {
    return new AgentEvent(AgentEventType.TOOL_CALL_COMPLETE, {
      call_id: callId,
      name,
      success: result.success,
      output: result.output,
      error: result.error,
      metadata: result.metadata,
      diff: result.diff?.toDiff() || null,
      truncated: result.truncated,
      exit_code: result.exitCode,
    });
  }
}
