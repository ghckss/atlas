import type { Role } from "../../domain";
import { can } from "../../domain";

export interface SlashCommandInput {
  command: "status" | "config";
  userRole: Role;
}

export interface SlashCommandResponse {
  ephemeral: boolean;
  content: string;
}

export function handleSlashCommand(input: SlashCommandInput): SlashCommandResponse {
  if (input.command === "status") {
    return {
      ephemeral: true,
      content: "Hermes is ready."
    };
  }

  if (!can(input.userRole, "system:configure")) {
    return {
      ephemeral: true,
      content: "권한이 없습니다."
    };
  }

  return {
    ephemeral: true,
    content: "Configuration access granted."
  };
}
