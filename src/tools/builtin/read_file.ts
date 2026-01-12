import { readFileSync, statSync, existsSync } from "fs";
import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { isBinaryFile, resolvePath } from "../../utils/paths.js";
import { countTokens, truncateText } from "../../utils/text.js";

const ReadFileParamsSchema = z.object({
  path: z.string().describe("Path to the file to read (relative to working directory or absolute)"),
  offset: z.number().int().min(1).default(1).describe("Line number to start reading from (1-based). Defaults to 1"),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to read. If not specified, reads entire file."),
});

export class ReadFileTool extends Tool {
  name = "read_file";
  description =
    "Read the contents of a text file. Returns the file content with line numbers. " +
    "For large files, use offset and limit to read specific portions. " +
    "Cannot read binary files (images, executables, etc.).";
  kind = ToolKind.READ;
  schema = ReadFileParamsSchema;

  private readonly MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB
  private readonly MAX_OUTPUT_TOKENS = 25000;

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = ReadFileParamsSchema.parse(invocation.params);
    const path = resolvePath(invocation.cwd, params.path);

    if (!existsSync(path)) {
      return ToolResult.errorResult(`File not found: ${path}`);
    }

    const stats = statSync(path);
    if (!stats.isFile()) {
      return ToolResult.errorResult(`Path is not a file: ${path}`);
    }

    const fileSize = stats.size;

    if (fileSize > this.MAX_FILE_SIZE) {
      return ToolResult.errorResult(
        `File too large (${(fileSize / (1024 * 1024)).toFixed(1)}MB). ` +
          `Maximum is ${this.MAX_FILE_SIZE / (1024 * 1024)}MB.`
      );
    }

    if (isBinaryFile(path)) {
      const fileSizeMb = fileSize / (1024 * 1024);
      const sizeStr =
        fileSizeMb >= 1 ? `${fileSizeMb.toFixed(2)}MB` : `${fileSize} bytes`;
      const pathParts = path.split("/");
      const fileName = pathParts[pathParts.length - 1];
      return ToolResult.errorResult(
        `Cannot read binary file: ${fileName} (${sizeStr}) ` +
          `This tool only reads text files.`
      );
    }

    try {
      let content: string;
      try {
        content = readFileSync(path, "utf-8");
      } catch {
        content = readFileSync(path, "latin1");
      }

      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      if (totalLines === 0) {
        return ToolResult.successResult("File is empty.", {
          lines: 0,
        });
      }

      const startIdx = Math.max(0, params.offset - 1);
      const endIdx =
        params.limit !== undefined
          ? Math.min(startIdx + params.limit, totalLines)
          : totalLines;

      const selectedLines = lines.slice(startIdx, endIdx);
      const formattedLines: string[] = [];

      for (let i = 0; i < selectedLines.length; i++) {
        const lineNum = startIdx + i + 1;
        formattedLines.push(`${lineNum.toString().padStart(6)}|${selectedLines[i]}`);
      }

      let output = formattedLines.join("\n");
      const tokenCount = countTokens(output);

      let truncated = false;
      if (tokenCount > this.MAX_OUTPUT_TOKENS) {
        output = truncateText(
          output,
          this.config.modelName,
          this.MAX_OUTPUT_TOKENS,
          `\n... [truncated ${totalLines} total lines]`
        );
        truncated = true;
      }

      const metadataLines: string[] = [];
      if (startIdx > 0 || endIdx < totalLines) {
        metadataLines.push(
          `Showing lines ${startIdx + 1}-${endIdx} of ${totalLines}`
        );
      }

      if (metadataLines.length > 0) {
        const header = metadataLines.join(" | ") + "\n\n";
        output = header + output;
      }

      return ToolResult.successResult(output, {
        path,
        totalLines,
        shownStart: startIdx + 1,
        shownEnd: endIdx,
        truncated,
      });
    } catch (error: any) {
      return ToolResult.errorResult(`Failed to read file: ${error.message}`);
    }
  }
}
