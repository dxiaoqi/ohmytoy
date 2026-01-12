import { writeFileSync, existsSync, readFileSync } from "fs";
import { dirname } from "path";
import { z } from "zod";
import {
  Tool,
  ToolInvocation,
  ToolKind,
  ToolResult,
  ToolConfirmation,
  FileDiff,
} from "../base.js";
import { resolvePath, ensureParentDirectory } from "../../utils/paths.js";

const WriteFileParamsSchema = z.object({
  path: z.string().describe("Path to the file to write (relative to working directory or absolute)"),
  content: z.string().describe("Content to write to the file"),
  createDirectories: z.boolean().default(true).describe("Create parent directories if they don't exist"),
});

export class WriteFileTool extends Tool {
  name = "write_file";
  description =
    "Write content to a file. Creates the file if it doesn't exist, " +
    "or overwrites if it does. Parent directories are created automatically. " +
    "Use this for creating new files or completely replacing file contents. " +
    "For partial modifications, use the edit tool instead.";
  kind = ToolKind.WRITE;
  schema = WriteFileParamsSchema;

  async getConfirmation(
    invocation: ToolInvocation
  ): Promise<ToolConfirmation | null> {
    const params = WriteFileParamsSchema.parse(invocation.params);
    const path = resolvePath(invocation.cwd, params.path);

    const isNewFile = !existsSync(path);

    let oldContent = "";
    if (!isNewFile) {
      try {
        oldContent = readFileSync(path, "utf-8");
      } catch {
        // Ignore read errors
      }
    }

    const diff = new FileDiff(path, oldContent, params.content, isNewFile);

    const action = isNewFile ? "Created" : "Updated";

    return new ToolConfirmation(
      this.name,
      invocation.params,
      `${action} file: ${path}`,
      diff,
      [path],
      undefined,
      !isNewFile
    );
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = WriteFileParamsSchema.parse(invocation.params);
    const path = resolvePath(invocation.cwd, params.path);

    const isNewFile = !existsSync(path);
    let oldContent = "";

    if (!isNewFile) {
      try {
        oldContent = readFileSync(path, "utf-8");
      } catch {
        // Ignore read errors
      }
    }

    try {
      if (params.createDirectories) {
        ensureParentDirectory(path);
      } else {
        const parent = dirname(path);
        if (!existsSync(parent)) {
          return ToolResult.errorResult(
            `Parent directory does not exist: ${parent}`
          );
        }
      }

      writeFileSync(path, params.content, "utf-8");

      const action = isNewFile ? "Created" : "Updated";
      const lineCount = params.content.split(/\r?\n/).length;

      return ToolResult.successResult(
        `${action} ${path} ${lineCount} lines`,
        {
          path,
          isNewFile,
          lines: lineCount,
          bytes: Buffer.from(params.content, "utf-8").length,
        },
        new FileDiff(path, oldContent, params.content, isNewFile)
      );
    } catch (error: any) {
      return ToolResult.errorResult(`Failed to write file: ${error.message}`);
    }
  }
}
