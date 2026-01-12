import { readdirSync, statSync } from "fs";
import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { resolvePath } from "../../utils/paths.js";

const ListDirParamsSchema = z.object({
  path: z.string().default(".").describe("Directory path to list (default: current directory)"),
  includeHidden: z.boolean().default(false).describe("Whether to include hidden files and directories (default: false)"),
});

export class ListDirTool extends Tool {
  name = "list_dir";
  description = "List contents of a directory";
  kind = ToolKind.READ;
  schema = ListDirParamsSchema;

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = ListDirParamsSchema.parse(invocation.params);

    const dirPath = resolvePath(invocation.cwd, params.path);

    try {
      const stats = statSync(dirPath);
      if (!stats.isDirectory()) {
        return ToolResult.errorResult(`Path is not a directory: ${dirPath}`);
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return ToolResult.errorResult(`Directory does not exist: ${dirPath}`);
      }
      return ToolResult.errorResult(`Error accessing directory: ${error.message}`);
    }

    try {
      const items = readdirSync(dirPath, { withFileTypes: true });

      let filteredItems = items;
      if (!params.includeHidden) {
        filteredItems = items.filter((item) => !item.name.startsWith("."));
      }

      // Sort: directories first, then files, both alphabetically
      filteredItems.sort((a, b) => {
        const aIsDir = a.isDirectory();
        const bIsDir = b.isDirectory();
        if (aIsDir !== bIsDir) {
          return aIsDir ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      if (filteredItems.length === 0) {
        return ToolResult.successResult("Directory is empty", {
          path: dirPath,
          entries: 0,
        });
      }

      const lines: string[] = [];
      for (const item of filteredItems) {
        if (item.isDirectory()) {
          lines.push(`${item.name}/`);
        } else {
          lines.push(item.name);
        }
      }

      return ToolResult.successResult(lines.join("\n"), {
        path: dirPath,
        entries: filteredItems.length,
      });
    } catch (error: any) {
      return ToolResult.errorResult(`Error listing directory: ${error.message}`);
    }
  }
}
