export { ReadFileTool } from "./read_file.js";
export { WriteFileTool } from "./write_file.js";
export { ShellTool } from "./shell.js";
export { ListDirTool } from "./list_dir.js";
export { GrepTool } from "./grep.js";
export { EditFileTool } from "./edit_file.js";
export { GlobTool } from "./glob.js";
export { WebSearchTool } from "./web_search.js";
export { WebFetchTool } from "./web_fetch.js";
export { TodosTool } from "./todo.js";
export { MemoryTool } from "./memory.js";
export { PlanTool } from "./plan.js";

import { ReadFileTool } from "./read_file.js";
import { WriteFileTool } from "./write_file.js";
import { ShellTool } from "./shell.js";
import { ListDirTool } from "./list_dir.js";
import { GrepTool } from "./grep.js";
import { EditFileTool } from "./edit_file.js";
import { GlobTool } from "./glob.js";
import { WebSearchTool } from "./web_search.js";
import { WebFetchTool } from "./web_fetch.js";
import { TodosTool } from "./todo.js";
import { MemoryTool } from "./memory.js";
import { PlanTool } from "./plan.js";

export function getAllBuiltinTools(): Array<new (config: any) => any> {
  return [
    ReadFileTool,
    WriteFileTool,
    ShellTool,
    ListDirTool,
    GrepTool,
    EditFileTool,
    GlobTool,
    WebSearchTool,
    WebFetchTool,
    TodosTool,
    MemoryTool,
    PlanTool,
  ];
}
