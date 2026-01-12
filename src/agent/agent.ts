import { Config } from "../config/config.js";
import { AgentEvent, AgentEventType } from "./events.js";
import { Session } from "./session.js";
import { StreamEventType, ToolCall, ToolResultMessage } from "../client/response.js";
import { ToolConfirmation } from "../tools/base.js";
import { createLoopBreakerPrompt } from "../prompts/system.js";

export class Agent {
  public session: Session | null;

  constructor(
    private config: Config,
    confirmationCallback?: (confirmation: ToolConfirmation) => boolean | Promise<boolean>
  ) {
    this.session = new Session(config);
    if (confirmationCallback) {
      this.session.approvalManager.setConfirmationCallback(confirmationCallback);
    }
  }

  async *run(message: string): AsyncGenerator<AgentEvent, void, unknown> {
    if (!this.session) {
      return;
    }

    await this.session.hookSystem.triggerBeforeAgent(message);
    yield AgentEvent.agentStart(message);
    this.session.contextManager!.addUserMessage(message);

    let finalResponse: string | null = null;

    for await (const event of this.agenticLoop()) {
      yield event;

      if (event.type === AgentEventType.TEXT_COMPLETE) {
        finalResponse = event.data.content;
      }
    }

    await this.session.hookSystem.triggerAfterAgent(message, finalResponse);
    yield AgentEvent.agentEnd(finalResponse);
  }

  private async *agenticLoop(): AsyncGenerator<AgentEvent, void, unknown> {
    if (!this.session) {
      return;
    }

    const maxTurns = this.config.maxTurns;

    for (let turnNum = 0; turnNum < maxTurns; turnNum++) {
      this.session.incrementTurn();
      let responseText = "";

      // Check for context overflow
      if (this.session.contextManager!.needsCompression()) {
        const [summary, usage] = await this.session.chatCompactor.compress(
          this.session.contextManager!
        );

        if (summary && usage) {
          this.session.contextManager!.replaceWithSummary(summary);
          this.session.contextManager!.setLatestUsage(usage);
          this.session.contextManager!.addUsage(usage);
        }
      }

      const toolSchemas = this.session.toolRegistry.getSchemas();

      const toolCalls: ToolCall[] = [];
      let usage = null;

      for await (const event of this.session.client.chatCompletion(
        this.session.contextManager!.getMessages(),
        toolSchemas.length > 0 ? toolSchemas : null
      )) {
        if (event.type === StreamEventType.TEXT_DELTA) {
          if (event.textDelta) {
            const content = event.textDelta.content;
            responseText += content;
            yield AgentEvent.textDelta(content);
          }
        } else if (event.type === StreamEventType.TOOL_CALL_COMPLETE) {
          if (event.toolCall) {
            toolCalls.push(event.toolCall);
          }
        } else if (event.type === StreamEventType.ERROR) {
          yield AgentEvent.agentError(event.error || "Unknown error occurred.");
        } else if (event.type === StreamEventType.MESSAGE_COMPLETE) {
          usage = event.usage;
        }
      }

      this.session.contextManager!.addAssistantMessage(
        responseText || null,
        toolCalls.length > 0
          ? toolCalls.map((tc) => ({
              id: tc.callId,
              type: "function",
              function: {
                name: tc.name || "",
                arguments: JSON.stringify(tc.args),
              },
            }))
          : null
      );

      if (responseText) {
        yield AgentEvent.textComplete(responseText);
        this.session.loopDetector.recordAction("response", {
          text: responseText,
        });
      }

      if (toolCalls.length === 0) {
        if (usage) {
          this.session.contextManager!.setLatestUsage(usage);
          this.session.contextManager!.addUsage(usage);
        }
        this.session.contextManager!.pruneToolOutputs();
        return;
      }

      const toolCallResults: ToolResultMessage[] = [];

      for (const toolCall of toolCalls) {
        yield AgentEvent.toolCallStart(
          toolCall.callId,
          toolCall.name || "",
          toolCall.args
        );

        this.session.loopDetector.recordAction("tool_call", {
          tool_name: toolCall.name,
          args: toolCall.args,
        });

        const result = await this.session.toolRegistry.invoke(
          toolCall.name || "",
          toolCall.args,
          this.config.cwd,
          this.session.hookSystem,
          this.session.approvalManager
        );

        yield AgentEvent.toolCallComplete(
          toolCall.callId,
          toolCall.name || "",
          result
        );

        toolCallResults.push(
          new ToolResultMessage(
            toolCall.callId,
            result.toModelOutput(),
            !result.success
          )
        );
      }

      for (const toolResult of toolCallResults) {
        this.session.contextManager!.addToolResult(
          toolResult.toolCallId,
          toolResult.content
        );
      }

      const loopDetectionError = this.session.loopDetector.checkForLoop();
      if (loopDetectionError) {
        const loopPrompt = createLoopBreakerPrompt(loopDetectionError);
        this.session.contextManager!.addUserMessage(loopPrompt);
      }

      if (usage) {
        this.session.contextManager!.setLatestUsage(usage);
        this.session.contextManager!.addUsage(usage);
      }

      this.session.contextManager!.pruneToolOutputs();
    }

    yield AgentEvent.agentError(`Maximum turns (${maxTurns}) reached`);
  }

  async initialize(): Promise<void> {
    if (this.session) {
      await this.session.initialize();
    }
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.client.close();
      await this.session.mcpManager.shutdown();
      this.session = null;
    }
  }
}
