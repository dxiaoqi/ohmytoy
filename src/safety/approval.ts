import { ApprovalPolicy } from "../config/config.js";
import { ToolConfirmation } from "../tools/base.js";
import { relative } from "path";

export enum ApprovalDecision {
  APPROVED = "approved",
  REJECTED = "rejected",
  NEEDS_CONFIRMATION = "needs_confirmation",
}

export class ApprovalContext {
  constructor(
    public toolName: string,
    public params: Record<string, any>,
    public isMutating: boolean,
    public affectedPaths: string[],
    public command?: string | null,
    public isDangerous: boolean = false
  ) {}
}

const DANGEROUS_PATTERNS = [
  // File system destruction
  /rm\s+(-rf?|--recursive)\s+[/~]/,
  /rm\s+-rf?\s+\*/,
  /rmdir\s+[/~]/,
  // Disk operations
  /dd\s+if=/,
  /mkfs/,
  /fdisk/,
  /parted/,
  // System control
  /shutdown/,
  /reboot/,
  /halt/,
  /poweroff/,
  /init\s+[06]/,
  // Permission changes on root
  /chmod\s+(-R\s+)?777\s+[/~]/,
  /chown\s+-R\s+.*\s+[/~]/,
  // Network exposure
  /nc\s+-l/,
  /netcat\s+-l/,
  // Code execution from network
  /curl\s+.*\|\s*(bash|sh)/,
  /wget\s+.*\|\s*(bash|sh)/,
  // Fork bomb
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,
];

// Patterns for safe commands (can be auto-approved)
const SAFE_PATTERNS = [
  // Information commands
  /^(ls|dir|pwd|cd|echo|cat|head|tail|less|more|wc)(\s|$)/,
  /^(find|locate|which|whereis|file|stat)(\s|$)/,
  // Development tools (read-only)
  /^git\s+(status|log|diff|show|branch|remote|tag)(\s|$)/,
  /^(npm|yarn|pnpm)\s+(list|ls|outdated)(\s|$)/,
  /^pip\s+(list|show|freeze)(\s|$)/,
  /^cargo\s+(tree|search)(\s|$)/,
  // Text processing (usually safe)
  /^(grep|awk|sed|cut|sort|uniq|tr|diff|comm)(\s|$)/,
  // System info
  /^(date|cal|uptime|whoami|id|groups|hostname|uname)(\s|$)/,
  /^(env|printenv|set)$/,
  // Process info
  /^(ps|top|htop|pgrep)(\s|$)/,
];

function isDangerousCommand(command: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

function isSafeCommand(command: string): boolean {
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

export class ApprovalManager {
  private confirmationCallback?: (confirmation: ToolConfirmation) => boolean | Promise<boolean>;

  constructor(
    private approvalPolicy: ApprovalPolicy,
    private cwd: string
  ) {}

  setConfirmationCallback(
    callback: (confirmation: ToolConfirmation) => boolean | Promise<boolean>
  ): void {
    this.confirmationCallback = callback;
  }

  private assessCommandSafety(command: string): ApprovalDecision {
    if (this.approvalPolicy === ApprovalPolicy.YOLO) {
      return ApprovalDecision.APPROVED;
    }

    if (isDangerousCommand(command)) {
      return ApprovalDecision.REJECTED;
    }

    if (this.approvalPolicy === ApprovalPolicy.NEVER) {
      if (isSafeCommand(command)) {
        return ApprovalDecision.APPROVED;
      }
      return ApprovalDecision.REJECTED;
    }

    if (
      this.approvalPolicy === ApprovalPolicy.AUTO ||
      this.approvalPolicy === ApprovalPolicy.ON_FAILURE
    ) {
      return ApprovalDecision.APPROVED;
    }

    if (this.approvalPolicy === ApprovalPolicy.AUTO_EDIT) {
      if (isSafeCommand(command)) {
        return ApprovalDecision.APPROVED;
      }
      return ApprovalDecision.NEEDS_CONFIRMATION;
    }

    if (isSafeCommand(command)) {
      return ApprovalDecision.APPROVED;
    }

    return ApprovalDecision.NEEDS_CONFIRMATION;
  }

  async checkApproval(context: ApprovalContext): Promise<ApprovalDecision> {
    if (!context.isMutating) {
      return ApprovalDecision.APPROVED;
    }

    if (context.command) {
      const decision = this.assessCommandSafety(context.command);
      if (decision !== ApprovalDecision.NEEDS_CONFIRMATION) {
        return decision;
      }
    }

    for (const path of context.affectedPaths) {
      try {
        const relPath = relative(this.cwd, path);
        if (relPath.startsWith("..")) {
          return ApprovalDecision.NEEDS_CONFIRMATION;
        }
      } catch {
        return ApprovalDecision.NEEDS_CONFIRMATION;
      }
    }

    if (context.isDangerous) {
      if (this.approvalPolicy === ApprovalPolicy.YOLO) {
        return ApprovalDecision.APPROVED;
      }
      return ApprovalDecision.NEEDS_CONFIRMATION;
    }

    return ApprovalDecision.APPROVED;
  }

  async requestConfirmation(confirmation: ToolConfirmation): Promise<boolean> {
    if (this.confirmationCallback) {
      const result = this.confirmationCallback(confirmation);
      return result instanceof Promise ? await result : result;
    }
    return true;
  }
}
