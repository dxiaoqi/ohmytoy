import { z } from "zod";
import { resolve } from "path";
import { existsSync } from "fs";

export enum ApprovalPolicy {
  ON_REQUEST = "on-request",
  ON_FAILURE = "on-failure",
  AUTO = "auto",
  AUTO_EDIT = "auto-edit",
  NEVER = "never",
  YOLO = "yolo",
}

export enum HookTrigger {
  BEFORE_AGENT = "before_agent",
  AFTER_AGENT = "after_agent",
  BEFORE_TOOL = "before_tool",
  AFTER_TOOL = "after_tool",
  ON_ERROR = "on_error",
}

const ModelConfigSchema = z.object({
  name: z.string().default("mistralai/devstral-2512:free"),
  temperature: z.number().min(0).max(2).default(1),
  contextWindow: z.number().default(256_000),
});

const ShellEnvironmentPolicySchema = z.object({
  ignoreDefaultExcludes: z.boolean().default(false),
  excludePatterns: z.array(z.string()).default(["*KEY*", "*TOKEN*", "*SECRET*"]),
  setVars: z.record(z.string()).default({}),
});

const MCPServerConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    startupTimeoutSec: z.number().default(10),
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).default({}),
    cwd: z.string().optional(),
    url: z.string().url().optional(),
  })
  .refine(
    (data) => {
      const hasCommand = !!data.command;
      const hasUrl = !!data.url;
      return hasCommand || hasUrl;
    },
    {
      message: "MCP Server must have either 'command' (stdio) or 'url' (http/sse)",
    }
  )
  .refine(
    (data) => {
      const hasCommand = !!data.command;
      const hasUrl = !!data.url;
      return !(hasCommand && hasUrl);
    },
    {
      message:
        "MCP Server cannot have both 'command' (stdio) and 'url' (http/sse)",
    }
  );

const HookConfigSchema = z
  .object({
    name: z.string(),
    trigger: z.nativeEnum(HookTrigger),
    command: z.string().optional(),
    script: z.string().optional(),
    timeoutSec: z.number().default(30),
    enabled: z.boolean().default(true),
  })
  .refine(
    (data) => !!data.command || !!data.script,
    {
      message: "Hook must either have 'command' or 'script'",
    }
  );

const SubagentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  goalPrompt: z.string(),
  allowedTools: z.array(z.string()).optional(),
  maxTurns: z.number().optional(),
  timeoutSeconds: z.number().optional(),
});

const ConfigSchema = z.object({
  model: ModelConfigSchema.default({}),
  cwd: z.string().default(process.cwd()),
  shellEnvironment: ShellEnvironmentPolicySchema.default({}),
  hooksEnabled: z.boolean().default(false),
  hooks: z.array(HookConfigSchema).default([]),
  approval: z.nativeEnum(ApprovalPolicy).default(ApprovalPolicy.ON_REQUEST),
  maxTurns: z.number().default(100),
  mcpServers: z.record(MCPServerConfigSchema).default({}),
  subagents: z.array(SubagentConfigSchema).optional(),
  allowedTools: z.array(z.string()).optional(),
  developerInstructions: z.string().optional(),
  userInstructions: z.string().optional(),
  debug: z.boolean().default(false),
  // API configuration - can be set in config file or environment variables
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.string().optional()),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ShellEnvironmentPolicy = z.infer<typeof ShellEnvironmentPolicySchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type HookConfig = z.infer<typeof HookConfigSchema>;
export type SubagentConfig = z.infer<typeof SubagentConfigSchema>;
export type Config = z.infer<typeof ConfigSchema> & {
  apiKey?: string;
  baseUrl?: string;
  modelName: string;
  temperature: number;
};

export function createConfig(data: any): Config {
  const parsed = ConfigSchema.parse(data);
  
  // Priority: config file > environment variable
  // Support both API_KEY and OPENAI_API_KEY for compatibility
  const apiKey = parsed.apiKey || process.env.API_KEY || process.env.OPENAI_API_KEY;
  // Support both BASE_URL and OPENAI_API_BASE_URL for compatibility
  const baseUrl = parsed.baseUrl || process.env.BASE_URL || process.env.OPENAI_API_BASE_URL;
  
  return {
    ...parsed,
    cwd: resolve(parsed.cwd),
    apiKey,
    baseUrl,
    get modelName(): string {
      return this.model.name;
    },
    set modelName(value: string) {
      this.model.name = value;
    },
    get temperature(): number {
      return this.model.temperature;
    },
    set temperature(value: number) {
      this.model.temperature = value;
    },
  };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push(
      "No API key found. Set 'apiKey' in config file or API_KEY environment variable"
    );
  }

  if (!existsSync(config.cwd)) {
    errors.push(`Working directory does not exist: ${config.cwd}`);
  }

  return errors;
}
