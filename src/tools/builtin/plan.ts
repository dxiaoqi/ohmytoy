import { z } from "zod";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.js";
import { Config } from "../../config/config.js";

const PlanParamsSchema = z.object({
  action: z
    .enum(["create", "view", "update", "execute", "clear", "status"])
    .describe(
      "Action: 'create' (create a new plan), 'view' (view current plan), 'update' (update plan steps), 'execute' (execute a step), 'clear' (clear current plan), 'status' (show plan status)"
    ),
  task: z
    .string()
    .optional()
    .describe("Task description (required for 'create' action)"),
  plan: z
    .string()
    .optional()
    .describe("Plan content in markdown format (for 'create' or 'update')"),
  step_id: z
    .string()
    .optional()
    .describe("Step ID (for 'execute' or 'update' actions)"),
  step_status: z
    .enum(["pending", "in_progress", "completed", "failed", "skipped"])
    .optional()
    .describe("Step status (for 'update' action)"),
  step_description: z
    .string()
    .optional()
    .describe("Step description (for 'update' action)"),
});

interface PlanStep {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  dependencies?: string[];
  result?: string;
}

interface Plan {
  task: string;
  plan: string;
  steps: PlanStep[];
  createdAt: Date;
  updatedAt: Date;
}

export class PlanTool extends Tool {
  name = "plan";
  description =
    "Create, manage, and execute plans for complex tasks. Use this to break down complex tasks into steps, track progress, and execute them systematically.";
  kind = ToolKind.MEMORY;
  schema = PlanParamsSchema;
  private currentPlan: Plan | null = null;

  constructor(config: Config) {
    super(config);
  }

  isMutating(_params: Record<string, any>): boolean {
    return false; // Plan tool doesn't mutate files directly
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = PlanParamsSchema.parse(invocation.params);

    if (params.action === "create") {
      if (!params.task) {
        return ToolResult.errorResult(
          "`task` is required for 'create' action"
        );
      }

      // Parse plan if provided, otherwise create empty plan
      const planContent = params.plan || "";
      const steps = this.parsePlanSteps(planContent);

      this.currentPlan = {
        task: params.task,
        plan: planContent,
        steps,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return ToolResult.successResult(
        this.formatPlan(this.currentPlan),
        { plan_created: true }
      );
    } else if (params.action === "view") {
      if (!this.currentPlan) {
        return ToolResult.successResult("No plan created yet");
      }

      return ToolResult.successResult(this.formatPlan(this.currentPlan));
    } else if (params.action === "update") {
      if (!this.currentPlan) {
        return ToolResult.errorResult("No plan exists. Create one first.");
      }

      if (params.plan) {
        // Update entire plan
        this.currentPlan.plan = params.plan;
        this.currentPlan.steps = this.parsePlanSteps(params.plan);
        this.currentPlan.updatedAt = new Date();
      } else if (params.step_id) {
        // Update specific step
        const step = this.currentPlan.steps.find((s) => s.id === params.step_id);
        if (!step) {
          return ToolResult.errorResult(`Step not found: ${params.step_id}`);
        }

        if (params.step_status) {
          step.status = params.step_status;
        }
        if (params.step_description) {
          step.description = params.step_description;
        }
        this.currentPlan.updatedAt = new Date();
      } else {
        return ToolResult.errorResult(
          "Either 'plan' or 'step_id' with 'step_status'/'step_description' is required for 'update'"
        );
      }

      return ToolResult.successResult(
        `Plan updated:\n${this.formatPlan(this.currentPlan)}`
      );
    } else if (params.action === "execute") {
      if (!this.currentPlan) {
        return ToolResult.errorResult("No plan exists. Create one first.");
      }

      if (!params.step_id) {
        // Execute next pending step
        const nextStep = this.currentPlan.steps.find(
          (s) => s.status === "pending"
        );
        if (!nextStep) {
          return ToolResult.successResult(
            "No pending steps to execute. All steps are completed or in progress."
          );
        }

        // Check dependencies
        if (nextStep.dependencies) {
          const unmetDeps = nextStep.dependencies.filter(
            (depId) =>
              !this.currentPlan!.steps.find(
                (s) => s.id === depId && s.status === "completed"
              )
          );
          if (unmetDeps.length > 0) {
            return ToolResult.errorResult(
              `Step ${nextStep.id} has unmet dependencies: ${unmetDeps.join(", ")}`
            );
          }
        }

        nextStep.status = "in_progress";
        this.currentPlan.updatedAt = new Date();

        return ToolResult.successResult(
          `Executing step ${nextStep.id}: ${nextStep.description}\n\nStatus: in_progress\n\nPlease proceed with the actions for this step. Use 'plan' tool with action 'update' and step_status 'completed' or 'failed' to mark the step as done.`,
          { step_id: nextStep.id, step_description: nextStep.description }
        );
      } else {
        // Execute specific step
        const step = this.currentPlan.steps.find(
          (s) => s.id === params.step_id
        );
        if (!step) {
          return ToolResult.errorResult(`Step not found: ${params.step_id}`);
        }

        if (step.status === "completed") {
          return ToolResult.successResult(
            `Step ${step.id} is already completed`
          );
        }

        // Check dependencies
        if (step.dependencies) {
          const unmetDeps = step.dependencies.filter(
            (depId) =>
              !this.currentPlan!.steps.find(
                (s) => s.id === depId && s.status === "completed"
              )
          );
          if (unmetDeps.length > 0) {
            return ToolResult.errorResult(
              `Step ${step.id} has unmet dependencies: ${unmetDeps.join(", ")}`
            );
          }
        }

        step.status = "in_progress";
        this.currentPlan.updatedAt = new Date();

        return ToolResult.successResult(
          `Executing step ${step.id}: ${step.description}\n\nStatus: in_progress\n\nPlease proceed with the actions for this step. Use 'plan' tool with action 'update' and step_status 'completed' or 'failed' to mark the step as done.`,
          { step_id: step.id, step_description: step.description }
        );
      }
    } else if (params.action === "status") {
      if (!this.currentPlan) {
        return ToolResult.successResult("No plan created yet");
      }

      const stats = this.calculatePlanStats(this.currentPlan);
      return ToolResult.successResult(
        `Plan Status:\nTask: ${this.currentPlan.task}\n\nSteps: ${stats.total} total\n  - Pending: ${stats.pending}\n  - In Progress: ${stats.in_progress}\n  - Completed: ${stats.completed}\n  - Failed: ${stats.failed}\n  - Skipped: ${stats.skipped}\n\nProgress: ${stats.percentage}%`
      );
    } else if (params.action === "clear") {
      const hadPlan = this.currentPlan !== null;
      this.currentPlan = null;
      return ToolResult.successResult(
        hadPlan ? "Plan cleared" : "No plan to clear"
      );
    } else {
      return ToolResult.errorResult(`Unknown action: ${params.action}`);
    }
  }

  private parsePlanSteps(planContent: string): PlanStep[] {
    const steps: PlanStep[] = [];
    const lines = planContent.split("\n");

    let currentStep: Partial<PlanStep> | null = null;

    for (const line of lines) {
      // Match markdown list items: - or * or 1. etc.
      const stepMatch = line.match(/^[\s]*[-*]|^[\s]*\d+\.\s+(.+)$/);
      if (stepMatch) {
        // Save previous step if exists
        if (currentStep && currentStep.id && currentStep.description) {
          steps.push({
            id: currentStep.id,
            description: currentStep.description,
            status: currentStep.status || "pending",
            dependencies: currentStep.dependencies,
          });
        }

        // Start new step
        const description = stepMatch[1] || line.replace(/^[\s]*[-*]\s+/, "").trim();
        const stepId = this.generateStepId(steps.length + 1);
        currentStep = {
          id: stepId,
          description: description.trim(),
          status: "pending" as const,
        };
      } else if (currentStep && line.trim()) {
        // Check for dependencies or additional info
        const depMatch = line.match(/depends?[:\s]+(.+)/i);
        if (depMatch) {
          currentStep.dependencies = depMatch[1]
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean);
        }
      }
    }

    // Add last step
    if (currentStep && currentStep.id && currentStep.description) {
      steps.push({
        id: currentStep.id,
        description: currentStep.description,
        status: currentStep.status || "pending",
        dependencies: currentStep.dependencies,
      });
    }

    // If no steps found, create a default step
    if (steps.length === 0 && planContent.trim()) {
      steps.push({
        id: this.generateStepId(1),
        description: planContent.trim(),
        status: "pending",
      });
    }

    return steps;
  }

  private generateStepId(index: number): string {
    return `step-${index}`;
  }

  private formatPlan(plan: Plan): string {
    const lines: string[] = [];
    lines.push(`Task: ${plan.task}`);
    lines.push(`\nPlan:`);
    if (plan.plan) {
      lines.push(plan.plan);
    } else {
      lines.push("(No detailed plan provided)");
    }

    if (plan.steps.length > 0) {
      lines.push(`\nSteps (${plan.steps.length}):`);
      for (const step of plan.steps) {
        const statusIcon =
          step.status === "completed"
            ? "✓"
            : step.status === "failed"
            ? "✗"
            : step.status === "in_progress"
            ? "⟳"
            : step.status === "skipped"
            ? "⊘"
            : "○";
        lines.push(
          `  ${statusIcon} [${step.id}] ${step.description} (${step.status})`
        );
        if (step.dependencies && step.dependencies.length > 0) {
          lines.push(`    Depends on: ${step.dependencies.join(", ")}`);
        }
      }
    }

    return lines.join("\n");
  }

  private calculatePlanStats(plan: Plan): {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
    skipped: number;
    percentage: number;
  } {
    const stats = {
      total: plan.steps.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      percentage: 0,
    };

    for (const step of plan.steps) {
      stats[step.status]++;
    }

    if (stats.total > 0) {
      stats.percentage = Math.round(
        ((stats.completed + stats.skipped) / stats.total) * 100
      );
    }

    return stats;
  }
}
