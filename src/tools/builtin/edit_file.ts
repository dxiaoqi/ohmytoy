import { readFileSync, writeFileSync, existsSync } from "fs";
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

const EditParamsSchema = z.object({
  path: z.string().describe("Path to the file to edit (relative to working directory or absolute path)"),
  oldString: z.string().default("").describe("The exact text to find and replace. Must match exactly including all whitespace and indentation. For new files, leave this empty."),
  newString: z.string().describe("The text to replace old_string with. Can be empty to delete text"),
  replaceAll: z.boolean().default(false).describe("Replace all occurrences of old_string (default: false)"),
});

export class EditFileTool extends Tool {
  name = "edit";
  description =
    "Edit a file by replacing text. The old_string must match exactly " +
    "(including whitespace and indentation) and must be unique in the file " +
    "unless replace_all is true. Use this for precise, surgical edits. " +
    "For creating new files or complete rewrites, use write_file instead.";
  kind = ToolKind.WRITE;
  schema = EditParamsSchema;

  async getConfirmation(
    invocation: ToolInvocation
  ): Promise<ToolConfirmation | null> {
    const params = EditParamsSchema.parse(invocation.params);
    const path = resolvePath(invocation.cwd, params.path);

    const isNewFile = !existsSync(path);

    if (isNewFile) {
      const diff = new FileDiff(path, "", params.newString, true);

      return new ToolConfirmation(
        this.name,
        invocation.params,
        `Create new file: ${path}`,
        diff,
        [path]
      );
    }

    const oldContent = readFileSync(path, "utf-8");
    const newContent = params.replaceAll
      ? oldContent.replaceAll(params.oldString, params.newString)
      : oldContent.replace(params.oldString, params.newString);

    const diff = new FileDiff(path, oldContent, newContent);

    return new ToolConfirmation(
      this.name,
      invocation.params,
      `Edit file: ${path}`,
      diff,
      [path]
    );
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = EditParamsSchema.parse(invocation.params);
    const path = resolvePath(invocation.cwd, params.path);

    if (!existsSync(path)) {
      if (params.oldString) {
        return ToolResult.errorResult(
          `File does not exist: ${path}. To create a new file, use an empty old_string.`
        );
      }

      ensureParentDirectory(path);
      writeFileSync(path, params.newString, "utf-8");

      const lineCount = params.newString.split(/\r?\n/).length;

      return ToolResult.successResult(
        `Created ${path} ${lineCount} lines`,
        {
          path,
          is_new_file: true,
          lines: lineCount,
        },
        new FileDiff(path, "", params.newString, true)
      );
    }

    const oldContent = readFileSync(path, "utf-8");

    if (!params.oldString) {
      return ToolResult.errorResult(
        "old_string is empty but file exists. Provide old_string to edit, or use write_file to overwrite."
      );
    }

    const occurrenceCount = (oldContent.match(new RegExp(params.oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

    if (occurrenceCount === 0) {
      return this.noMatchError(params.oldString, oldContent, path);
    }

    if (occurrenceCount > 1 && !params.replaceAll) {
      return ToolResult.errorResult(
        `old_string found ${occurrenceCount} times in ${path}. ` +
          `Either: \n` +
          `1. Provide more context to make the match unique or\n` +
          `2. Set replace_all=true to replace all occurrences`,
        "",
        { occurrence_count: occurrenceCount }
      );
    }

    let newContent: string;
    let replaceCount: number;

    if (params.replaceAll) {
      newContent = oldContent.replaceAll(params.oldString, params.newString);
      replaceCount = occurrenceCount;
    } else {
      newContent = oldContent.replace(params.oldString, params.newString);
      replaceCount = 1;
    }

    if (newContent === oldContent) {
      return ToolResult.errorResult(
        "No change made - old_string equals new_string"
      );
    }

    try {
      writeFileSync(path, newContent, "utf-8");
    } catch (error: any) {
      return ToolResult.errorResult(`Failed to write file: ${error.message}`);
    }

    const oldLines = oldContent.split(/\r?\n/).length;
    const newLines = newContent.split(/\r?\n/).length;
    const lineDiff = newLines - oldLines;

    let diffMsg = "";
    if (lineDiff > 0) {
      diffMsg = ` (+${lineDiff} lines)`;
    } else if (lineDiff < 0) {
      diffMsg = ` (${lineDiff} lines)`;
    }

    return ToolResult.successResult(
      `Edited ${path}: replaced ${replaceCount} occurrence(s)${diffMsg}`,
      {
        path,
        replaced_count: replaceCount,
        line_diff: lineDiff,
      },
      new FileDiff(path, oldContent, newContent)
    );
  }

  private noMatchError(
    oldString: string,
    content: string,
    path: string
  ): ToolResult {
    const lines = content.split(/\r?\n/);
    const partialMatches: Array<[number, string]> = [];
    const searchTerms = oldString.split(/\s+/).slice(0, 5);

    if (searchTerms.length > 0) {
      const firstTerm = searchTerms[0];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(firstTerm)) {
          partialMatches.push([i + 1, lines[i].trim().substring(0, 80)]);
          if (partialMatches.length >= 3) {
            break;
          }
        }
      }
    }

    let errorMsg = `old_string not found in ${path}.`;

    if (partialMatches.length > 0) {
      errorMsg += "\n\nPossible similar lines:";
      for (const [lineNum, linePreview] of partialMatches) {
        errorMsg += `\n  Line ${lineNum}: ${linePreview}`;
      }
      errorMsg += "\n\nMake sure old_string matches exactly (including whitespace and indentation).";
    } else {
      errorMsg +=
        " Make sure the text matches exactly, including:\n" +
        "- All whitespace and indentation\n" +
        "- Line breaks\n" +
        "- Any invisible characters\n" +
        "Try re-reading the file using read_file tool and then editing.";
    }

    return ToolResult.errorResult(errorMsg);
  }
}
