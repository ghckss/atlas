import type { SoulExecutionPlan, SoulId } from "../../domain";
import { createSoulExecutionPlan } from "../../domain";

export interface TaskPlanningInput {
  request: string;
}

export class TaskPlanner {
  plan(input: TaskPlanningInput): SoulExecutionPlan {
    const request = input.request.toLowerCase();
    const souls = selectSouls(request);

    return createSoulExecutionPlan(input.request, souls);
  }
}

function selectSouls(request: string): readonly SoulId[] {
  const wantsReview = includesAny(request, ["review", "리뷰", "검토"]);
  const wantsCode = includesAny(request, [
    "implement",
    "code",
    "fix",
    "refactor",
    "구현",
    "코드",
    "수정",
    "리팩토링"
  ]);
  const wantsArchitecture = includesAny(request, [
    "architecture",
    "design",
    "structure",
    "설계",
    "구조",
    "아키텍처"
  ]);
  const wantsResearch = includesAny(request, [
    "research",
    "compare",
    "latest",
    "news",
    "조사",
    "비교",
    "최신",
    "뉴스"
  ]);
  const wantsTeaching = includesAny(request, [
    "explain",
    "teach",
    "tutorial",
    "what is",
    "설명",
    "가르쳐",
    "튜토리얼",
    "뭐야"
  ]);

  if (wantsReview && wantsCode) {
    return ["reviewer", "coder"];
  }

  if (wantsArchitecture && wantsCode) {
    return ["architect", "coder"];
  }

  if (wantsResearch && wantsCode) {
    return ["researcher", "coder"];
  }

  if (wantsArchitecture) {
    return ["architect"];
  }

  if (wantsReview) {
    return ["reviewer"];
  }

  if (wantsResearch) {
    return ["researcher"];
  }

  if (wantsTeaching) {
    return ["teacher"];
  }

  if (wantsCode) {
    return ["coder"];
  }

  return ["default"];
}

function includesAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}
