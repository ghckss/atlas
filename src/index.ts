export const platformName = "ai-assistant-platform";

export * from "./domain";

export function health(): { status: "ok"; service: string } {
  return {
    status: "ok",
    service: platformName
  };
}
