import { Config } from "../config/config.js";
import { TokenUsage } from "../client/response.js";
import { Tool } from "../tools/base.js";
import { getSystemPrompt } from "../prompts/system.js";
import { countTokens } from "../utils/text.js";

export class MessageItem {
  constructor(
    public role: string,
    public content: string,
    public toolCallId?: string | null,
    public toolCalls: Array<Record<string, any>> = [],
    public tokenCount?: number | null,
    public prunedAt?: Date | null
  ) {}

  toDict(): Record<string, any> {
    const result: Record<string, any> = { role: this.role };

    if (this.toolCallId) {
      result.tool_call_id = this.toolCallId;
    }

    if (this.toolCalls.length > 0) {
      result.tool_calls = this.toolCalls;
    }

    if (this.content) {
      result.content = this.content;
    }

    return result;
  }
}

export class ContextManager {
  private static readonly PRUNE_PROTECT_TOKENS = 40_000;
  private static readonly PRUNE_MINIMUM_TOKENS = 20_000;

  private readonly systemPrompt: string;
  private readonly config: Config;
  private readonly modelName: string;
  private messages: MessageItem[] = [];
  private latestUsage: TokenUsage = new TokenUsage();
  public totalUsage: TokenUsage = new TokenUsage();

  constructor(
    config: Config,
    userMemory?: string | null,
    tools?: Tool[] | null
  ) {
    this.config = config;
    this.modelName = config.modelName;
    this.systemPrompt = getSystemPrompt(config, userMemory, tools);
  }

  get messageCount(): number {
    return this.messages.length;
  }

  addUserMessage(content: string): void {
    const item = new MessageItem(
      "user",
      content,
      undefined,
      [],
      countTokens(content, this.modelName)
    );
    this.messages.push(item);
  }

  addAssistantMessage(
    content: string | null,
    toolCalls?: Array<Record<string, any>> | null
  ): void {
    const item = new MessageItem(
      "assistant",
      content || "",
      undefined,
      toolCalls || [],
      countTokens(content || "", this.modelName)
    );
    this.messages.push(item);
  }

  addToolResult(toolCallId: string, content: string): void {
    const item = new MessageItem(
      "tool",
      content,
      toolCallId,
      [],
      countTokens(content, this.modelName)
    );
    this.messages.push(item);
  }

  getMessages(): Array<Record<string, any>> {
    const messages: Array<Record<string, any>> = [];

    if (this.systemPrompt) {
      messages.push({
        role: "system",
        content: this.systemPrompt,
      });
    }

    for (const item of this.messages) {
      messages.push(item.toDict());
    }

    return messages;
  }

  needsCompression(): boolean {
    const contextLimit = this.config.model.contextWindow;
    const currentTokens = this.latestUsage.totalTokens;
    return currentTokens > contextLimit * 0.8;
  }

  setLatestUsage(usage: TokenUsage): void {
    this.latestUsage = usage;
  }

  addUsage(usage: TokenUsage): void {
    this.totalUsage = this.totalUsage.add(usage);
  }

  replaceWithSummary(summary: string): void {
    this.messages = [];

    const continuationContent = `# Context Restoration (Previous Session Compacted)

        The previous conversation was compacted due to context length limits. Below is a detailed summary of the work done so far. 

        **CRITICAL: Actions listed under "COMPLETED ACTIONS" are already done. DO NOT repeat them.**

        ---

        ${summary}

        ---

        Resume work from where we left off. Focus ONLY on the remaining tasks.`;

    const summaryItem = new MessageItem(
      "user",
      continuationContent,
      undefined,
      [],
      countTokens(continuationContent, this.modelName)
    );
    this.messages.push(summaryItem);

    const ackContent = `I've reviewed the context from the previous session. I understand:
- The original goal and what was requested
- Which actions are ALREADY COMPLETED (I will NOT repeat these)
- The current state of the project
- What still needs to be done

I'll continue with the REMAINING tasks only, starting from where we left off.`;
    const ackItem = new MessageItem(
      "assistant",
      ackContent,
      undefined,
      [],
      countTokens(ackContent, this.modelName)
    );
    this.messages.push(ackItem);

    const continueContent =
      "Continue with the REMAINING work only. Do NOT repeat any completed actions. " +
      "Proceed with the next step as described in the context above.";

    const continueItem = new MessageItem(
      "user",
      continueContent,
      undefined,
      [],
      countTokens(continueContent, this.modelName)
    );
    this.messages.push(continueItem);
  }

  pruneToolOutputs(): number {
    const userMessageCount = this.messages.filter(
      (msg) => msg.role === "user"
    ).length;

    if (userMessageCount < 2) {
      return 0;
    }

    let totalTokens = 0;
    let prunedTokens = 0;
    const toPrune: MessageItem[] = [];

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === "tool" && msg.toolCallId) {
        if (msg.prunedAt) {
          break;
        }

        const tokens =
          msg.tokenCount || countTokens(msg.content, this.modelName);
        totalTokens += tokens;

        if (totalTokens > ContextManager.PRUNE_PROTECT_TOKENS) {
          prunedTokens += tokens;
          toPrune.push(msg);
        }
      }
    }

    if (prunedTokens < ContextManager.PRUNE_MINIMUM_TOKENS) {
      return 0;
    }

    let prunedCount = 0;

    for (const msg of toPrune) {
      msg.content = "[Old tool result content cleared]";
      msg.tokenCount = countTokens(msg.content, this.modelName);
      msg.prunedAt = new Date();
      prunedCount++;
    }

    return prunedCount;
  }

  clear(): void {
    this.messages = [];
  }
}
