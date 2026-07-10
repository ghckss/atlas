import type { SoulRuntime, SoulRuntimeInput } from "../../application";

export class TemplateSoulRuntime implements SoulRuntime {
  async execute(input: SoulRuntimeInput): Promise<string> {
    const context = input.memoryContext.trim();
    const previous = input.previousOutput?.trim();
    const evidence = previous || context || "아직 연결된 외부 근거가 없습니다.";

    return [
      `[${input.soul}] ${input.request}`,
      "",
      evidence,
      "",
      "로컬 MVP 런타임 응답입니다. 실제 LLM provider 연결 전까지 이 응답기는 service wiring과 workflow 검증에 사용됩니다."
    ].join("\n");
  }
}
