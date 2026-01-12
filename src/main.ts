#!/usr/bin/env node

import { Command } from "commander";
import { createInterface } from "readline";
import chalk from "chalk";
import { loadConfig } from "./config/loader.js";
import { validateConfig } from "./config/config.js";
import { Agent } from "./agent/agent.js";
import { AgentEventType } from "./agent/events.js";
import { ApprovalPolicy } from "./config/config.js";
import { PersistenceManager, SessionSnapshot } from "./agent/persistence.js";
import { Session } from "./agent/session.js";
import { TUI } from "./ui/tui.js";

async function runSingle(message: string, cwd?: string): Promise<void> {
  const config = loadConfig(cwd);
  const errors = validateConfig(config);

  if (errors.length > 0) {
    const tui = new TUI(config);
    for (const error of errors) {
      tui.printError(error);
    }
    process.exit(1);
  }

  const tui = new TUI(config);
  const agent = new Agent(config);
  await agent.initialize();

  try {
    let finalResponse: string | null = null;

    for await (const event of agent.run(message)) {
      if (event.type === AgentEventType.TEXT_DELTA) {
        tui.streamAssistantDelta(event.data.content);
      } else if (event.type === AgentEventType.TEXT_COMPLETE) {
        finalResponse = event.data.content;
        console.log(); // New line after streaming
      } else if (event.type === AgentEventType.AGENT_ERROR) {
        tui.printError(event.data.error);
      } else if (event.type === AgentEventType.TOOL_CALL_START) {
        tui.toolCallStart(
          event.data.call_id || event.data.callId || "",
          event.data.name || "",
          event.data.arguments || {},
          undefined // Tool kind not available in event
        );
      } else if (event.type === AgentEventType.TOOL_CALL_COMPLETE) {
        tui.toolCallComplete(
          event.data.call_id || event.data.callId || "",
          event.data.name || "",
          event.data.success || false,
          event.data.output || event.data.result?.content || "",
          event.data.error,
          undefined // Tool kind not available in event
        );
      }
    }

    if (!finalResponse) {
      process.exit(1);
    }
  } finally {
    await agent.close();
  }
}

async function runInteractive(cwd?: string): Promise<void> {
  const config = loadConfig(cwd);
  const errors = validateConfig(config);

  const tui = new TUI(config);

  if (errors.length > 0) {
    for (const error of errors) {
      tui.printError(error);
    }
    process.exit(1);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  tui.printWelcome("AI Agent", [
    `model: ${config.modelName}`,
    `cwd: ${config.cwd}`,
    "commands: /help /config /approval /model /exit",
  ]);

  const agent = new Agent(config, async (confirmation) => {
    return await tui.requestApproval(confirmation);
  });

  await agent.initialize();

  try {
    while (true) {
      const userInput = (await question("\n" + chalk.blue.bold("[user]") + "> ")).trim();
      if (!userInput) {
        continue;
      }

      if (userInput.startsWith("/")) {
        const shouldContinue = await handleCommand(userInput, agent, config, tui);
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      await processMessage(userInput, agent, tui);
    }
  } finally {
    rl.close();
    await agent.close();
    tui.printGoodbye();
  }
}

async function handleCommand(
  command: string,
  agent: Agent,
  config: any,
  tui: TUI
): Promise<boolean> {
  const cmd = command.toLowerCase().trim();
  const parts = cmd.split(/\s+/);
  const cmdName = parts[0];
  const cmdArgs = parts.slice(1).join(" ");

  if (cmdName === "/exit" || cmdName === "/quit") {
    return false;
  } else if (command === "/help") {
    tui.printHelp();
  } else if (command === "/clear") {
    if (agent && agent.session && agent.session.contextManager) {
      agent.session.contextManager.clear();
      agent.session.loopDetector.clear();
      tui.printSuccess("Conversation cleared");
    } else {
      tui.printSuccess("Conversation cleared");
    }
  } else if (command === "/config") {
    console.log("\n[bold]Current Configuration[/bold]");
    console.log(`  Model: ${config.modelName}`);
    console.log(`  Temperature: ${config.temperature}`);
    console.log(`  Approval: ${config.approval}`);
    console.log(`  Working Dir: ${config.cwd}`);
    console.log(`  Max Turns: ${config.maxTurns}`);
    console.log(`  Hooks Enabled: ${config.hooksEnabled}`);
  } else if (cmdName === "/model") {
    if (cmdArgs) {
      config.modelName = cmdArgs;
      tui.printSuccess(`Model changed to: ${cmdArgs}`);
    } else {
      tui.printInfo(`Current model: ${config.modelName}`);
    }
  } else if (cmdName === "/approval") {
    if (cmdArgs) {
      try {
        config.approval = cmdArgs as ApprovalPolicy;
        tui.printSuccess(`Approval policy changed to: ${cmdArgs}`);
      } catch {
        tui.printError(`Incorrect approval policy: ${cmdArgs}`);
        tui.printInfo(`Valid options: ${Object.values(ApprovalPolicy).join(", ")}`);
      }
    } else {
      tui.printInfo(`Current approval policy: ${config.approval}`);
    }
  } else if (command === "/clear") {
    if (agent && agent.session && agent.session.contextManager) {
      agent.session.contextManager.clear();
      agent.session.loopDetector.clear();
      tui.printSuccess("Conversation cleared");
    } else {
      tui.printSuccess("Conversation cleared");
    }
  } else if (command === "/stats") {
    if (agent && agent.session) {
      const stats = agent.session.getStats();
      tui.printStats(stats);
    } else {
      tui.printError("No active session");
    }
  } else if (command === "/tools") {
    if (agent && agent.session) {
      const tools = agent.session.toolRegistry.getTools();
      const toolList = tools.map(t => ({
        name: t.name,
        description: t.description || "No description",
      }));
      tui.printTools(toolList);
    } else {
      tui.printError("No active session");
    }
  } else if (cmdName === "/mcp") {
    if (agent && agent.session) {
      const servers = agent.session.mcpManager.getAllServers();
      tui.printMcpServers(servers);
    } else {
      tui.printError("No active session");
    }
  } else if (cmdName === "/mcp-health") {
    if (agent && agent.session) {
      const healthStatuses = agent.session.mcpManager.getHealthStatuses();
      tui.printMcpHealth(healthStatuses);
    } else {
      tui.printError("No active session");
    }
  } else if (cmdName === "/reload") {
    if (!agent || !agent.session) {
      console.log("[error]No active session[/error]");
      return true;
    }

    console.log("[info]Reloading discovered tools...[/info]");
    const result = await agent.session.reloadTools();
    
    if (result.success) {
      const errors = agent.session.discoveryManager.discoveryErrors;
      if (errors.length > 0) {
        console.log(`[warn]Reloaded with ${errors.length} error(s):[/warn]`);
        for (const err of errors) {
          console.log(`  • ${err.file}: [${err.type}] ${err.error}`);
        }
      } else {
        console.log("[success]Tools reloaded successfully[/success]");
      }
      console.log(`[info]Discovered ${agent.session.discoveryManager.discoveredToolFiles.length} tool file(s)[/info]`);
    } else {
      console.log(`[error]Failed to reload tools: ${result.errors.join(", ")}[/error]`);
    }
  } else if (cmdName === "/save") {
    if (!agent || !agent.session) {
      console.log("[error]No active session[/error]");
      return true;
    }

    const session = agent.session;
    const persistenceManager = new PersistenceManager();
    const { TokenUsage } = await import("./client/response.js");
    const sessionSnapshot = new SessionSnapshot(
      session.sessionId,
      session.createdAt,
      session.updatedAt,
      session.turnCount,
      session.contextManager?.getMessages() || [],
      session.contextManager?.totalUsage || new TokenUsage()
    );
    persistenceManager.saveSession(sessionSnapshot);
    tui.printSuccess(`Session saved: ${session.sessionId}`);
  } else if (cmdName === "/sessions") {
    const persistenceManager = new PersistenceManager();
    const sessions = persistenceManager.listSessions();
    tui.printSessions(sessions);
  } else if (cmdName === "/resume") {
    if (!cmdArgs) {
      tui.printError("Usage: /resume <session_id>");
      return true;
    }

    if (!agent) {
      tui.printError("No active agent");
      return true;
    }

    const persistenceManager = new PersistenceManager();
    const snapshot = persistenceManager.loadSession(cmdArgs);
    if (!snapshot) {
      tui.printError("Session does not exist");
      return true;
    }

    const session = new Session(config);
    await session.initialize();
    session.sessionId = snapshot.sessionId;
    session.createdAt = snapshot.createdAt;
    session.updatedAt = snapshot.updatedAt;
    session.turnCount = snapshot.turnCount;
    if (session.contextManager) {
      session.contextManager.totalUsage = snapshot.totalUsage;

      for (const msg of snapshot.messages) {
        if (msg.role === "system") {
          continue;
        } else if (msg.role === "user") {
          session.contextManager.addUserMessage(msg.content || "");
        } else if (msg.role === "assistant") {
          session.contextManager.addAssistantMessage(
            msg.content || null,
            msg.tool_calls || null
          );
        } else if (msg.role === "tool") {
          session.contextManager.addToolResult(
            msg.tool_call_id || "",
            msg.content || ""
          );
        }
      }
    }

    if (agent.session) {
      await agent.session.client.close();
    }
    agent.session = session;
    tui.printSuccess(`Resumed session: ${session.sessionId}`);
  } else if (cmdName === "/checkpoint") {
    if (!agent || !agent.session) {
      tui.printError("No active session");
      return true;
    }

    const session = agent.session;
    const persistenceManager = new PersistenceManager();
    const { TokenUsage } = await import("./client/response.js");
    const sessionSnapshot = new SessionSnapshot(
      session.sessionId,
      session.createdAt,
      session.updatedAt,
      session.turnCount,
      session.contextManager?.getMessages() || [],
      session.contextManager?.totalUsage || new TokenUsage()
    );
    const checkpointId = persistenceManager.saveCheckpoint(sessionSnapshot);
    tui.printSuccess(`Checkpoint created: ${checkpointId}`);
  } else if (cmdName === "/restore") {
    if (!cmdArgs) {
      tui.printError("Usage: /restore <checkpoint_id>");
      return true;
    }

    if (!agent) {
      tui.printError("No active agent");
      return true;
    }

    const persistenceManager = new PersistenceManager();
    const snapshot = persistenceManager.loadCheckpoint(cmdArgs);
    if (!snapshot) {
      tui.printError("Checkpoint does not exist");
      return true;
    }

    const session = new Session(config);
    await session.initialize();
    session.sessionId = snapshot.sessionId;
    session.createdAt = snapshot.createdAt;
    session.updatedAt = snapshot.updatedAt;
    session.turnCount = snapshot.turnCount;
    if (session.contextManager) {
      session.contextManager.totalUsage = snapshot.totalUsage;

      for (const msg of snapshot.messages) {
        if (msg.role === "system") {
          continue;
        } else if (msg.role === "user") {
          session.contextManager.addUserMessage(msg.content || "");
        } else if (msg.role === "assistant") {
          session.contextManager.addAssistantMessage(
            msg.content || null,
            msg.tool_calls || null
          );
        } else if (msg.role === "tool") {
          session.contextManager.addToolResult(
            msg.tool_call_id || "",
            msg.content || ""
          );
        }
      }
    }

    if (agent.session) {
      await agent.session.client.close();
    }
    agent.session = session;
    tui.printSuccess(`Restored session: ${session.sessionId}, checkpoint: ${cmdArgs}`);
  } else {
    tui.printError(`Unknown command: ${cmdName}`);
  }

  return true;
}

async function processMessage(message: string, agentInstance: Agent, tui: TUI): Promise<void> {
  tui.beginAssistant();

  for await (const event of agentInstance.run(message)) {
    if (event.type === AgentEventType.TEXT_DELTA) {
      tui.streamAssistantDelta(event.data.content);
    } else if (event.type === AgentEventType.TEXT_COMPLETE) {
      console.log(); // New line after streaming
    } else if (event.type === AgentEventType.AGENT_ERROR) {
      tui.printError(`Error: ${event.data.error}`);
    } else if (event.type === AgentEventType.TOOL_CALL_START) {
      tui.toolCallStart(
        event.data.call_id || event.data.callId || "",
        event.data.name || "",
        event.data.arguments || {},
        undefined // Tool kind not available in event
      );
    } else if (event.type === AgentEventType.TOOL_CALL_COMPLETE) {
      tui.toolCallComplete(
        event.data.call_id || event.data.callId || "",
        event.data.name || "",
        event.data.success || false,
        event.data.output || event.data.result?.content || "",
        event.data.error,
        undefined // Tool kind not available in event
      );
    }
  }

  tui.endAssistant();
}

const program = new Command();

program
  .name("ai-agent")
  .description("AI coding agent with tool calling")
  .version("1.0.0")
  .argument("[prompt]", "Prompt to execute (if not provided, starts interactive mode)")
  .option("-c, --cwd <path>", "Current working directory")
  .action(async (prompt?: string, options?: { cwd?: string }) => {
    try {
      if (prompt) {
        await runSingle(prompt, options?.cwd);
      } else {
        await runInteractive(options?.cwd);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
