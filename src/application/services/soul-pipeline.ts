import type { SoulExecutionPlan, SoulExecutionStep, SoulId } from "../../domain";

export interface SoulRuntimeInput {
  soul: SoulId;
  request: string;
  memoryContext: string;
  previousOutput?: string;
}

export interface SoulRuntime {
  execute(input: SoulRuntimeInput): Promise<string>;
}

export interface SoulPipelineRunInput {
  plan: SoulExecutionPlan;
  memoryContext: string;
}

export interface SoulPipelineStepResult {
  step: SoulExecutionStep;
  output: string;
}

export interface SoulPipelineResult {
  finalOutput: string;
  steps: readonly SoulPipelineStepResult[];
}

export class SoulPipeline {
  constructor(private readonly runtime: SoulRuntime) {}

  async run(input: SoulPipelineRunInput): Promise<SoulPipelineResult> {
    const stepResults: SoulPipelineStepResult[] = [];
    let previousOutput: string | undefined;

    for (const step of input.plan.steps) {
      const output = await this.runtime.execute({
        soul: step.soul,
        request: input.plan.objective,
        memoryContext: input.memoryContext,
        previousOutput
      });

      stepResults.push({
        step,
        output
      });
      previousOutput = output;
    }

    return {
      finalOutput: previousOutput ?? "",
      steps: stepResults
    };
  }
}
