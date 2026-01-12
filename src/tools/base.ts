import { z } from "zod";
import { Config } from "../config/config.js";
import { diffLines } from "diff";

export enum ToolKind {
  READ = "read",
  WRITE = "write",
  SHELL = "shell",
  NETWORK = "network",
  MEMORY = "memory",
  MCP = "mcp",
}

export class FileDiff {
  constructor(
    public path: string,
    public oldContent: string,
    public newContent: string,
    public isNewFile: boolean = false,
    public isDeletion: boolean = false
  ) {}

  toDiff(): string {
    const oldName = this.isNewFile ? "/dev/null" : this.path;
    const newName = this.isDeletion ? "/dev/null" : this.path;

    const changes = diffLines(this.oldContent, this.newContent);
    let diff = `--- ${oldName}\n+++ ${newName}\n`;

    let oldLineNum = 1;
    let newLineNum = 1;

    for (const change of changes) {
      if (change.added) {
        for (const line of change.value.split(/\r?\n/)) {
          if (line) {
            diff += `+${line}\n`;
            newLineNum++;
          }
        }
      } else if (change.removed) {
        for (const line of change.value.split(/\r?\n/)) {
          if (line) {
            diff += `-${line}\n`;
            oldLineNum++;
          }
        }
      } else {
        const lines = change.value.split(/\r?\n/);
        for (const line of lines) {
          if (line) {
            diff += ` ${line}\n`;
            oldLineNum++;
            newLineNum++;
          }
        }
      }
    }

    return diff;
  }
}

export class ToolResult {
  constructor(
    public success: boolean,
    public output: string,
    public error?: string | null,
    public metadata: Record<string, any> = {},
    public truncated: boolean = false,
    public diff?: FileDiff | null,
    public exitCode?: number | null
  ) {}

  static errorResult(
    error: string,
    output: string = "",
    metadata: Record<string, any> = {}
  ): ToolResult {
    return new ToolResult(false, output, error, metadata);
  }

  static successResult(
    output: string,
    metadata: Record<string, any> = {},
    diff?: FileDiff
  ): ToolResult {
    return new ToolResult(true, output, null, metadata, false, diff);
  }

  toModelOutput(): string {
    if (this.success) {
      return this.output;
    }
    return `Error: ${this.error}\n\nOutput:\n${this.output}`;
  }
}

export class ToolInvocation {
  constructor(
    public params: Record<string, any>,
    public cwd: string
  ) {}
}

export class ToolConfirmation {
  constructor(
    public toolName: string,
    public params: Record<string, any>,
    public description: string,
    public diff?: FileDiff | null,
    public affectedPaths: string[] = [],
    public command?: string | null,
    public isDangerous: boolean = false
  ) {}
}

export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract kind: ToolKind;
  abstract schema: z.ZodSchema | Record<string, any>;

  constructor(public config: Config) {}

  validateParams(params: Record<string, any>): string[] {
    const schema = this.schema;
    const errors: string[] = [];

    if (schema instanceof z.ZodSchema) {
      const result = schema.safeParse(params);
      if (!result.success) {
        for (const error of result.error.errors) {
          const field = error.path.join(".");
          errors.push(`Parameter '${field}': ${error.message}`);
        }
      }
    }

    return errors;
  }

  isMutating(_params: Record<string, any>): boolean {
    return [
      ToolKind.WRITE,
      ToolKind.SHELL,
      ToolKind.NETWORK,
      ToolKind.MEMORY,
    ].includes(this.kind);
  }

  async getConfirmation(
    invocation: ToolInvocation
  ): Promise<ToolConfirmation | null> {
    if (!this.isMutating(invocation.params)) {
      return null;
    }

    return new ToolConfirmation(
      this.name,
      invocation.params,
      `Execute ${this.name}`
    );
  }

  toOpenAISchema(): Record<string, any> {
    const schema = this.schema;

    if (schema instanceof z.ZodSchema) {
      const jsonSchema = (schema as any)._def.schema || schema;
      const shape = jsonSchema._def?.shape() || {};

      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const zodType = (value as any)._def;
        properties[key] = zodTypeToJsonSchema(zodType);
        if (zodType.typeName !== "ZodOptional") {
          required.push(key);
        }
      }

      return {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties,
          required,
        },
      };
    }

    if (typeof schema === "object" && schema !== null) {
      const result: Record<string, any> = {
        name: this.name,
        description: this.description,
      };

      if ("parameters" in schema) {
        result.parameters = (schema as any).parameters;
      } else {
        result.parameters = schema;
      }

      return result;
    }

    throw new Error(`Invalid schema type for tool ${this.name}: ${typeof schema}`);
  }

  abstract execute(invocation: ToolInvocation): Promise<ToolResult>;
}

function zodTypeToJsonSchema(zodType: any): any {
  if (zodType.typeName === "ZodString") {
    return { type: "string" };
  }
  if (zodType.typeName === "ZodNumber") {
    return { type: "number" };
  }
  if (zodType.typeName === "ZodBoolean") {
    return { type: "boolean" };
  }
  if (zodType.typeName === "ZodArray") {
    return {
      type: "array",
      items: zodTypeToJsonSchema(zodType._def.type),
    };
  }
  if (zodType.typeName === "ZodObject") {
    const shape = zodType._def.shape();
    const properties: Record<string, any> = {};
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema((value as any)._def);
    }
    return { type: "object", properties };
  }
  return { type: "string" };
}
