import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult, ToolConfirmation } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

const execAsync = promisify(exec);

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf /*",
  "dd if=/dev/zero",
  "dd if=/dev/random",
  "mkfs",
  "fdisk",
  "parted",
  ":(){ :|:& };:", // Fork bomb
  "chmod 777 /",
  "chmod -R 777",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",
];

const ShellParamsSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  timeout: z.number().int().min(1).max(600).default(120).describe("Timeout in seconds (default: 120)"),
  cwd: z.string().optional().describe("Working directory for the command"),
});

export class ShellTool extends Tool {
  name = "shell";
  kind = ToolKind.SHELL;
  description = "Execute a shell command. Use this for running system commands, scripts and CLI tools.";
  schema = ShellParamsSchema;

  async getConfirmation(
    invocation: ToolInvocation
  ): Promise<ToolConfirmation | null> {
    const params = ShellParamsSchema.parse(invocation.params);

    for (const blocked of BLOCKED_COMMANDS) {
      if (params.command.includes(blocked)) {
        return new ToolConfirmation(
          this.name,
          invocation.params,
          `Execute (BLOCKED): ${params.command}`,
          undefined,
          [],
          params.command,
          true
        );
      }
    }

    return new ToolConfirmation(
      this.name,
      invocation.params,
      `Execute: ${params.command}`,
      undefined,
      [],
      params.command,
      false
    );
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = ShellParamsSchema.parse(invocation.params);

    const command = params.command.toLowerCase().trim();
    for (const blocked of BLOCKED_COMMANDS) {
      if (command.includes(blocked)) {
        return ToolResult.errorResult(
          `Command blocked for safety: ${params.command}`,
          "",
          { blocked: true }
        );
      }
    }

    let cwd: string;
    if (params.cwd) {
      const resolvedCwd = resolvePath(invocation.cwd, params.cwd);
      if (!existsSync(resolvedCwd)) {
        return ToolResult.errorResult(
          `Working directory doesn't exist: ${resolvedCwd}`
        );
      }
      cwd = resolvedCwd;
    } else {
      cwd = invocation.cwd;
    }

    if (!existsSync(cwd)) {
      return ToolResult.errorResult(`Working directory doesn't exist: ${cwd}`);
    }

    const env = this.buildEnvironment();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), params.timeout * 1000);

      try {
        const { stdout, stderr } = await execAsync(params.command, {
          cwd,
          env,
          signal: controller.signal as any,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });

        clearTimeout(timeoutId);

        let output = "";
        if (stdout?.trim()) {
          output += stdout.trim();
        }

        if (stderr?.trim()) {
          if (output) output += "\n--- stderr ---\n";
          output += stderr.trim();
        }

        // Limit output size
        if (output.length > 100 * 1024) {
          output = output.substring(0, 100 * 1024) + "\n... [output truncated]";
        }

        return ToolResult.successResult(output, {
          exit_code: 0,
        });
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.signal === "SIGABRT") {
          return ToolResult.errorResult(
            `Command timed out after ${params.timeout}s`
          );
        }

        const exitCode = error.code || 1;
        let output = error.stdout || "";
        const stderr = error.stderr || "";

        if (stderr) {
          if (output) output += "\n--- stderr ---\n";
          output += stderr;
        }

        if (output.length > 100 * 1024) {
          output = output.substring(0, 100 * 1024) + "\n... [output truncated]";
        }

        return ToolResult.errorResult(
          stderr || "Command failed",
          output,
          { exit_code: exitCode }
        );
      }
    } catch (error: any) {
      return ToolResult.errorResult(
        `Failed to execute command: ${error.message || error}`
      );
    }
  }

  private buildEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};
    // Copy process.env, filtering out undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const shellEnvironment = this.config.shellEnvironment;

    if (!shellEnvironment.ignoreDefaultExcludes) {
      for (const pattern of shellEnvironment.excludePatterns) {
        const keysToRemove = Object.keys(env).filter((k) => {
          const upperKey = k.toUpperCase();
          const upperPattern = pattern.toUpperCase();
          // Simple pattern matching
          const regex = new RegExp(
            upperPattern.replace(/\*/g, ".*").replace(/\?/g, ".")
          );
          return regex.test(upperKey);
        });

        for (const k of keysToRemove) {
          delete env[k];
        }
      }
    }

    if (shellEnvironment.setVars) {
      Object.assign(env, shellEnvironment.setVars);
    }

    return env;
  }
}
