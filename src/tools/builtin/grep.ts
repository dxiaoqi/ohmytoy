import { readFileSync, statSync, readdirSync } from "fs";
import { join, relative } from "path";
import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { resolvePath, isBinaryFile } from "../../utils/paths.js";

const GrepParamsSchema = z.object({
  pattern: z.string().describe("Regular expression pattern to search for"),
  path: z.string().default(".").describe("File or directory to search in (default: current directory)"),
  caseInsensitive: z.boolean().default(false).describe("Case-insensitive search (default: false)"),
});

export class GrepTool extends Tool {
  name = "grep";
  description = "Search for a regex pattern in file contents. Returns matching lines with file paths and line numbers.";
  kind = ToolKind.READ;
  schema = GrepParamsSchema;

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = GrepParamsSchema.parse(invocation.params);

    const searchPath = resolvePath(invocation.cwd, params.path);

    try {
      statSync(searchPath);
    } catch {
      return ToolResult.errorResult(`Path does not exist: ${searchPath}`);
    }

    let pattern: RegExp;
    try {
      const flags = params.caseInsensitive ? "i" : "";
      pattern = new RegExp(params.pattern, flags);
    } catch (error: any) {
      return ToolResult.errorResult(`Invalid regex pattern: ${error.message}`);
    }

    const stats = statSync(searchPath);
    const files = stats.isDirectory()
      ? this.findFiles(searchPath, invocation.cwd)
      : [searchPath];

    const outputLines: string[] = [];
    let matches = 0;

    for (const filePath of files) {
      try {
        if (isBinaryFile(filePath)) {
          continue;
        }

        const content = readFileSync(filePath, "utf-8");
        const lines = content.split(/\r?\n/);
        let fileMatches = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (pattern.test(line)) {
            matches++;
            if (!fileMatches) {
              const relPath = relative(invocation.cwd, filePath);
              outputLines.push(`=== ${relPath} ===`);
              fileMatches = true;
            }
            outputLines.push(`${i + 1}:${line}`);
          }
        }

        if (fileMatches) {
          outputLines.push("");
        }
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    if (outputLines.length === 0) {
      return ToolResult.successResult(
        `No matches found for pattern '${params.pattern}'`,
        {
          path: searchPath,
          matches: 0,
          files_searched: files.length,
        }
      );
    }

    return ToolResult.successResult(outputLines.join("\n"), {
      path: searchPath,
      matches,
      files_searched: files.length,
    });
  }

  private findFiles(searchPath: string, _baseCwd: string): string[] {
    const files: string[] = [];
    const excludeDirs = new Set([
      "node_modules",
      "__pycache__",
      ".git",
      ".venv",
      "venv",
      "dist",
      "build",
      ".next",
    ]);

    const walk = (dir: string): void => {
      if (files.length >= 500) {
        return;
      }

      try {
        const items = readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = join(dir, item.name);

          if (item.isDirectory()) {
            if (!item.name.startsWith(".") && !excludeDirs.has(item.name)) {
              walk(fullPath);
            }
          } else if (item.isFile()) {
            if (!item.name.startsWith(".") && !isBinaryFile(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    walk(searchPath);
    return files;
  }
}
