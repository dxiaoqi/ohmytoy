import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

const GlobParamsSchema = z.object({
  pattern: z.string().describe("Glob pattern to match"),
  path: z.string().default(".").describe("Directory to search in (default: current directory)"),
});

export class GlobTool extends Tool {
  name = "glob";
  description = "Find files matching a glob pattern. Supports ** for recursive matching.";
  kind = ToolKind.READ;
  schema = GlobParamsSchema;

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = GlobParamsSchema.parse(invocation.params);

    const searchPath = resolvePath(invocation.cwd, params.path);

    try {
      const stats = statSync(searchPath);
      if (!stats.isDirectory()) {
        return ToolResult.errorResult(`Path is not a directory: ${searchPath}`);
      }
    } catch {
      return ToolResult.errorResult(`Directory does not exist: ${searchPath}`);
    }

    try {
      const matches = this.globMatch(searchPath, params.pattern, invocation.cwd);
      const outputLines: string[] = [];

      for (const filePath of matches.slice(0, 1000)) {
        try {
          const relPath = relative(invocation.cwd, filePath);
          outputLines.push(relPath);
        } catch {
          outputLines.push(filePath);
        }
      }

      if (matches.length > 1000) {
        outputLines.push("...(limited to 1000 results)");
      }

      return ToolResult.successResult(
        outputLines.join("\n"),
        {
          path: searchPath,
          matches: matches.length,
        }
      );
    } catch (error: any) {
      return ToolResult.errorResult(`Error searching: ${error.message}`);
    }
  }

  private globMatch(basePath: string, pattern: string, cwd: string): string[] {
    const matches: string[] = [];
    const isRecursive = pattern.includes("**");

    if (isRecursive) {
      this.walkRecursive(basePath, pattern, cwd, matches);
    } else {
      this.walkSingle(basePath, pattern, cwd, matches);
    }

    return matches;
  }

  private walkRecursive(
    dir: string,
    pattern: string,
    _cwd: string,
    matches: string[]
  ): void {
    if (matches.length >= 1000) {
      return;
    }

    try {
      const items = readdirSync(dir, { withFileTypes: true });
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

      for (const item of items) {
        const fullPath = join(dir, item.name);

        if (item.isDirectory()) {
          if (!item.name.startsWith(".") && !excludeDirs.has(item.name)) {
            this.walkRecursive(fullPath, pattern, _cwd, matches);
          }
        } else if (item.isFile()) {
          if (this.matchPattern(item.name, pattern)) {
            matches.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  private walkSingle(
    dir: string,
    pattern: string,
    _cwd: string,
    matches: string[]
  ): void {
    try {
      const items = readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.isFile() && this.matchPattern(item.name, pattern)) {
          matches.push(join(dir, item.name));
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  private matchPattern(filename: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }
}
