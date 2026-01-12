import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import Table from "cli-table3";
import { Config } from "../config/config.js";
import { ToolConfirmation } from "../tools/base.js";
import { ToolKind } from "../tools/base.js";

type OraInstance = ReturnType<typeof ora>;

export class TUI {
  private assistantStreamOpen: boolean = false;
  private toolSpinners: Map<string, OraInstance> = new Map();

  constructor(_config: Config) {
    // Config stored for future use
  }

  printWelcome(title: string, lines: string[]): void {
    const content = lines.join("\n");
    const boxed = boxen(content, {
      title,
      titleAlignment: "left",
      borderStyle: "round",
      padding: 1,
      borderColor: "cyan",
    });
    console.log(boxed);
  }

  printError(message: string): void {
    console.error(chalk.red.bold("✗"), chalk.red(message));
  }

  printSuccess(message: string): void {
    console.log(chalk.green.bold("✓"), chalk.green(message));
  }

  printWarning(message: string): void {
    console.log(chalk.yellow.bold("⚠"), chalk.yellow(message));
  }

  printInfo(message: string): void {
    console.log(chalk.cyan.bold("ℹ"), chalk.cyan(message));
  }

  printDim(message: string): void {
    console.log(chalk.dim(message));
  }

  printBold(message: string): void {
    console.log(chalk.bold(message));
  }

  beginAssistant(): void {
    console.log();
    console.log(chalk.bold.white("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.bold.white("Assistant"));
    console.log(chalk.bold.white("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    this.assistantStreamOpen = true;
  }

  endAssistant(): void {
    if (this.assistantStreamOpen) {
      console.log();
    }
    this.assistantStreamOpen = false;
  }

  streamAssistantDelta(content: string): void {
    process.stdout.write(content);
  }

  private getToolColor(kind?: ToolKind): typeof chalk {
    switch (kind) {
      case ToolKind.READ:
        return chalk.cyan;
      case ToolKind.WRITE:
        return chalk.yellow;
      case ToolKind.SHELL:
        return chalk.magenta;
      case ToolKind.NETWORK:
        return chalk.blue;
      case ToolKind.MEMORY:
        return chalk.green;
      case ToolKind.MCP:
        return chalk.cyanBright;
      default:
        return chalk.magentaBright;
    }
  }

  toolCallStart(
    callId: string,
    name: string,
    arguments_: Record<string, any>,
    kind?: ToolKind
  ): void {
    const color = this.getToolColor(kind);
    const shortId = callId ? callId.substring(0, 8) : "unknown";
    
    // Create spinner
    const spinner = ora({
      text: `${color.bold(name)} ${chalk.dim(`#${shortId}`)}`,
      color: "cyan",
    }).start();
    
    this.toolSpinners.set(callId, spinner);

    // Show arguments in a compact format
    if (Object.keys(arguments_).length > 0) {
      const argsPreview = this.formatToolArgs(name, arguments_);
      if (argsPreview) {
        spinner.text = `${color.bold(name)} ${chalk.dim(`#${shortId}`)} ${chalk.dim(argsPreview)}`;
      }
    }
  }

  toolCallComplete(
    callId: string,
    name: string,
    success: boolean,
    output: string,
    error?: string,
    kind?: ToolKind
  ): void {
    const spinner = callId ? this.toolSpinners.get(callId) : null;
    const color = this.getToolColor(kind);
    const shortId = callId ? callId.substring(0, 8) : "unknown";
    const icon = success ? chalk.green("✓") : chalk.red("✗");

    if (spinner) {
      spinner.stop();
      this.toolSpinners.delete(callId);
    }

    // Print result
    console.log();
    console.log(
      `${icon} ${color.bold(name)} ${chalk.dim(`#${shortId}`)}`
    );

    if (!success && error) {
      console.log(chalk.red(`  Error: ${error}`));
    } else if (output) {
      const truncated = this.truncateOutput(output, 500);
      if (truncated.length < output.length) {
        console.log(chalk.dim(`  Output: ${truncated}... (truncated)`));
      } else {
        console.log(chalk.dim(`  Output: ${truncated}`));
      }
    }
  }

  private formatToolArgs(toolName: string, args: Record<string, any>): string {
    const preferredOrder: Record<string, string[]> = {
      read_file: ["path", "offset", "limit"],
      write_file: ["path", "create_directories", "content"],
      edit: ["path", "replace_all", "old_string", "new_string"],
      shell: ["command", "timeout", "cwd"],
      list_dir: ["path", "include_hidden"],
      grep: ["path", "case_insensitive", "pattern"],
      glob: ["path", "pattern"],
      todos: ["id", "action", "content"],
      memory: ["action", "key", "value"],
    };

    const order = preferredOrder[toolName] || Object.keys(args);
    const parts: string[] = [];

    for (const key of order) {
      if (key in args) {
        const value = args[key];
        let displayValue: string;
        
        if (typeof value === "string") {
          if (value.length > 30) {
            displayValue = value.substring(0, 27) + "...";
          } else {
            displayValue = value;
          }
        } else {
          displayValue = JSON.stringify(value);
          if (displayValue.length > 30) {
            displayValue = displayValue.substring(0, 27) + "...";
          }
        }
        
        parts.push(`${key}=${displayValue}`);
      }
    }

    return parts.length > 0 ? `(${parts.join(", ")})` : "";
  }

  private truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) {
      return output;
    }
    return output.substring(0, maxLength);
  }

  printTable(headers: string[], rows: string[][]): void {
    const table = new Table({
      head: headers.map((h) => chalk.bold(h)),
      style: {
        head: ["cyan"],
        border: ["grey"],
      },
    });

    for (const row of rows) {
      table.push(row);
    }

    console.log(table.toString());
  }

  printConfig(config: Config): void {
    console.log();
    console.log(chalk.bold("Current Configuration"));
    console.log(chalk.dim("─".repeat(50)));
    
    const rows: string[][] = [
      ["Model", config.modelName],
      ["Temperature", String(config.temperature)],
      ["Approval", config.approval],
      ["Working Dir", config.cwd],
      ["Max Turns", String(config.maxTurns)],
      ["Hooks Enabled", config.hooksEnabled ? "Yes" : "No"],
    ];

    this.printTable(["Setting", "Value"], rows);
  }

  printStats(stats: Record<string, any>): void {
    console.log();
    console.log(chalk.bold("Session Statistics"));
    console.log(chalk.dim("─".repeat(50)));
    
    const rows: string[][] = [
      ["Session ID", stats.session_id || "N/A"],
      ["Created", stats.created_at || "N/A"],
      ["Turn Count", String(stats.turn_count || 0)],
      ["Message Count", String(stats.message_count || 0)],
      ["Tools Available", String(stats.tools_count || 0)],
      ["MCP Servers", String(stats.mcp_servers || 0)],
    ];

    if (stats.token_usage) {
      const usage = stats.token_usage;
      rows.push(["Tokens Used", String(usage.total || 0)]);
      rows.push(["Prompt Tokens", String(usage.prompt || 0)]);
      rows.push(["Completion Tokens", String(usage.completion || 0)]);
    }

    this.printTable(["Metric", "Value"], rows);
  }

  printTools(tools: Array<{ name: string; description: string }>): void {
    console.log();
    console.log(chalk.bold(`Available Tools (${tools.length})`));
    console.log(chalk.dim("─".repeat(50)));
    
    if (tools.length === 0) {
      console.log(chalk.dim("  No tools available"));
      return;
    }

    const rows: string[][] = tools.map((tool) => [
      chalk.cyan(tool.name),
      tool.description.length > 60
        ? tool.description.substring(0, 57) + "..."
        : tool.description,
    ]);

    this.printTable(["Name", "Description"], rows);
  }

  printMcpServers(servers: Array<{ name: string; status: string; tools: number }>): void {
    console.log();
    console.log(chalk.bold(`MCP Servers (${servers.length})`));
    console.log(chalk.dim("─".repeat(50)));
    
    if (servers.length === 0) {
      console.log(chalk.dim("  No MCP servers configured"));
      return;
    }

    const rows: string[][] = servers.map((server) => {
      const statusColor =
        server.status === "connected"
          ? chalk.green
          : server.status === "error"
          ? chalk.red
          : chalk.yellow;
      return [
        server.name,
        statusColor(server.status),
        String(server.tools),
      ];
    });

    this.printTable(["Name", "Status", "Tools"], rows);
  }

  printMcpHealth(healthStatuses: Array<{
    name: string;
    status: string;
    tools: number;
    lastCheck: Date;
    error?: string;
  }>): void {
    console.log();
    console.log(chalk.bold("MCP Server Health Status"));
    console.log(chalk.dim("─".repeat(50)));
    
    if (healthStatuses.length === 0) {
      console.log(chalk.dim("  No MCP servers configured"));
      return;
    }

    for (const health of healthStatuses) {
      console.log();
      console.log(chalk.bold(`  ${health.name}:`));
      const statusColor =
        health.status === "connected"
          ? chalk.green
          : health.status === "error"
          ? chalk.red
          : chalk.yellow;
      console.log(`    Status: ${statusColor(health.status)}`);
      console.log(`    Tools: ${health.tools}`);
      console.log(`    Last Check: ${health.lastCheck.toISOString()}`);
      if (health.error) {
        console.log(chalk.red(`    Error: ${health.error}`));
      }
    }
  }

  async requestApproval(confirmation: ToolConfirmation): Promise<boolean> {
    console.log();
    console.log(chalk.yellow.bold("⚠ Approval Request"));
    console.log(chalk.dim("─".repeat(50)));
    console.log(chalk.white(confirmation.description));

    if (confirmation.diff) {
      console.log();
      console.log(chalk.bold("Diff:"));
      console.log(chalk.dim(confirmation.diff.toDiff()));
    }

    if (confirmation.command) {
      console.log();
      console.log(chalk.bold("Command:"));
      console.log(chalk.cyan(confirmation.command));
    }

    if (confirmation.isDangerous) {
      console.log();
      console.log(chalk.red.bold("⚠ WARNING: This operation is potentially dangerous!"));
    }

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(chalk.yellow("\nApprove? (y/n): "), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });
  }

  printHelp(): void {
    const helpText = `
${chalk.bold("Available Commands:")}

  ${chalk.cyan("/help")}          - Show this help message
  ${chalk.cyan("/config")}        - Show current configuration
  ${chalk.cyan("/clear")}         - Clear conversation history
  ${chalk.cyan("/model <name>")} - Change model
  ${chalk.cyan("/approval <policy>")} - Change approval policy
  ${chalk.cyan("/stats")}         - Show session statistics
  ${chalk.cyan("/tools")}         - List available tools
  ${chalk.cyan("/mcp")}           - List MCP servers
  ${chalk.cyan("/mcp-health")}    - Check MCP server health
  ${chalk.cyan("/reload")}        - Reload discovered tools
  ${chalk.cyan("/save")}          - Save current session
  ${chalk.cyan("/sessions")}      - List saved sessions
  ${chalk.cyan("/resume <id>")}   - Resume a saved session
  ${chalk.cyan("/checkpoint")}    - Create a checkpoint
  ${chalk.cyan("/restore <id>")}  - Restore from checkpoint
  ${chalk.cyan("/exit, /quit")}   - Exit the program
`;
    console.log(helpText);
  }

  printSessions(sessions: Array<Record<string, any>>): void {
    console.log();
    console.log(chalk.bold("Saved Sessions"));
    console.log(chalk.dim("─".repeat(50)));
    
    if (sessions.length === 0) {
      console.log(chalk.dim("  No saved sessions"));
      return;
    }

    const rows: string[][] = sessions.map((s) => [
      s.session_id || "N/A",
      String(s.turn_count || 0),
      s.updated_at || "N/A",
    ]);

    this.printTable(["Session ID", "Turns", "Updated"], rows);
  }

  printGoodbye(): void {
    console.log();
    console.log(chalk.dim("Goodbye!"));
  }
}
