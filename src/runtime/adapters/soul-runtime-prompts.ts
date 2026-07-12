import type { SoulRuntimeInput } from "../../application";
import { soulProfiles } from "../../domain";

export function buildSoulInstructions(input: SoulRuntimeInput): string {
  const profile = soulProfiles[input.soul];

  return [
    "You are Hermes, an AI assistant platform for personal and small-team development workflows.",
    "Answer in Korean unless the user explicitly asks for another language.",
    "Do not mention internal pipeline mechanics unless they are directly relevant.",
    "",
    `[Soul Identity] ${profile.identity}`,
    `[Purpose] ${profile.purpose}`,
    `[Responsibilities] ${profile.responsibilities.join(", ")}`,
    `[Decision Principles] ${profile.decisionPrinciples.join(", ")}`,
    `[Response Style] ${profile.responseStyle}`,
    `[Things To Avoid] ${profile.thingsToAvoid.join(", ")}`
  ].join("\n");
}

export function buildSoulUserInput(input: SoulRuntimeInput): string {
  return [
    `[User Request]\n${input.request}`,
    input.previousOutput ? `[Previous Soul Output]\n${input.previousOutput}` : undefined,
    input.memoryContext.trim()
      ? `[Memory And Session Context]\n${input.memoryContext}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n\n");
}
