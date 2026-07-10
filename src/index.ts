export const platformName = "ai-assistant-platform";

export function health(): { status: "ok"; service: string } {
  return {
    status: "ok",
    service: platformName
  };
}
