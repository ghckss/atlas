export const platformName = "ai-assistant-platform";

export * from "./application";
export * from "./config";
export * from "./domain";
export * from "./infrastructure";
export * from "./interfaces";

export function health(): { status: "ok"; service: string } {
  return {
    status: "ok",
    service: platformName
  };
}
