import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Config, HookConfig, HookTrigger } from "../config/config.js";
import { ToolResult } from "../tools/base.js";

const execAsync = promisify(exec);

export class HookSystem {
  private hooks: HookConfig[] = [];

  constructor(private config: Config) {
    if (this.config.hooksEnabled) {
      this.hooks = this.config.hooks.filter((hook) => hook.enabled);
    }
  }

  private async runHook(hook: HookConfig, env: Record<string, string>): Promise<void> {
    try {
      if (hook.command) {
        await this.runCommand(hook.command, hook.timeoutSec, env);
      } else if (hook.script) {
        const scriptPath = join(tmpdir(), `hook-${Date.now()}.sh`);
        try {
          writeFileSync(scriptPath, `#!/bin/bash\n${hook.script}`, "utf-8");
          chmodSync(scriptPath, 0o755);
          await this.runCommand(scriptPath, hook.timeoutSec, env);
        } finally {
          try {
            unlinkSync(scriptPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    } catch (error: any) {
      // Log hook errors but don't fail the main process
      console.error(`Hook execution error (${hook.name}):`, error.message || error);
      // Don't rethrow - hooks are optional and shouldn't block execution
    }
  }

  private async runCommand(
    command: string,
    timeout: number,
    env: Record<string, string>
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    try {
      await execAsync(command, {
        cwd: this.config.cwd,
        env: { ...process.env, ...env },
        signal: controller.signal as any,
      });
    } catch (error: any) {
      if (error.signal === "SIGABRT") {
        // Timeout - ignore
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildEnv(
    trigger: HookTrigger,
    options: {
      toolName?: string | null;
      userMessage?: string | null;
      error?: Error | null;
    } = {}
  ): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env,
      AI_AGENT_TRIGGER: trigger,
      AI_AGENT_CWD: this.config.cwd,
    };

    if (options.toolName) {
      env.AI_AGENT_TOOL_NAME = options.toolName;
    }

    if (options.userMessage) {
      env.AI_AGENT_USER_MESSAGE = options.userMessage;
    }

    if (options.error) {
      env.AI_AGENT_ERROR = String(options.error);
    }

    return env;
  }

  async triggerBeforeAgent(userMessage: string): Promise<void> {
    const env = this.buildEnv(HookTrigger.BEFORE_AGENT, { userMessage });

    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.BEFORE_AGENT) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerAfterAgent(
    userMessage: string,
    agentResponse: string | null
  ): Promise<void> {
    const env = this.buildEnv(HookTrigger.AFTER_AGENT, { userMessage });
    if (agentResponse) {
      env.AI_AGENT_RESPONSE = agentResponse;
    }

    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.AFTER_AGENT) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerBeforeTool(
    toolName: string,
    toolParams: Record<string, any>
  ): Promise<void> {
    const env = this.buildEnv(HookTrigger.BEFORE_TOOL, { toolName });
    env.AI_AGENT_TOOL_PARAMS = JSON.stringify(toolParams);

    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.BEFORE_TOOL) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerAfterTool(
    toolName: string,
    toolParams: Record<string, any>,
    toolResult: ToolResult
  ): Promise<void> {
    const env = this.buildEnv(HookTrigger.AFTER_TOOL, { toolName });
    env.AI_AGENT_TOOL_PARAMS = JSON.stringify(toolParams);
    env.AI_AGENT_TOOL_RESULT = toolResult.toModelOutput();

    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.AFTER_TOOL) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerOnError(error: Error): Promise<void> {
    const env = this.buildEnv(HookTrigger.ON_ERROR, { error });

    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.ON_ERROR) {
        await this.runHook(hook, env);
      }
    }
  }
}
