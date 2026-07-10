import type { Role } from "../../domain";
import { can } from "../../domain";
import type { ChatHistoryRepository, ChatMessage } from "../ports";
import type { MemoryContextService } from "./memory-context-service";
import type { SoulPipelineResult } from "./soul-pipeline";
import { SoulPipeline } from "./soul-pipeline";
import { TaskPlanner } from "./task-planner";

export interface HermesChatUser {
  id: string;
  role: Role;
  teamId?: string;
  organizationId?: string;
}

export interface HermesChatRequest {
  sessionId: string;
  user: HermesChatUser;
  projectId?: string;
  content: string;
}

export interface HermesChatResponse {
  answer: string;
  pipeline: SoulPipelineResult;
  memoryCount: number;
}

export class HermesChatService {
  constructor(
    private readonly chatHistory: ChatHistoryRepository,
    private readonly memoryContext: MemoryContextService,
    private readonly planner: TaskPlanner,
    private readonly soulPipeline: SoulPipeline
  ) {}

  async respond(request: HermesChatRequest): Promise<HermesChatResponse> {
    if (!can(request.user.role, "conversation:send")) {
      throw new Error("User role is not allowed to send conversations.");
    }

    await this.chatHistory.appendMessage({
      sessionId: request.sessionId,
      role: "user",
      content: request.content,
      metadata: {
        userId: request.user.id,
        projectId: request.projectId
      }
    });

    const memory = await this.memoryContext.retrieve({
      identity: {
        userId: request.user.id,
        teamId: request.user.teamId,
        organizationId: request.user.organizationId,
        projectId: request.projectId
      },
      query: request.content,
      limit: 8
    });
    const recentMessages = await this.chatHistory.listRecentMessages(
      request.sessionId,
      12
    );
    const plan = this.planner.plan({
      request: request.content
    });
    const pipeline = await this.soulPipeline.run({
      plan,
      memoryContext: formatHermesContext(
        memory.memories.map((result) => result.record.content),
        recentMessages
      )
    });

    await this.chatHistory.appendMessage({
      sessionId: request.sessionId,
      role: "assistant",
      content: pipeline.finalOutput,
      metadata: {
        souls: pipeline.steps.map((step) => step.step.soul),
        memoryCount: memory.memories.length,
        sessionHistoryCount: recentMessages.length
      }
    });

    return {
      answer: pipeline.finalOutput,
      pipeline,
      memoryCount: memory.memories.length
    };
  }
}

function formatHermesContext(
  memories: readonly string[],
  recentMessages: readonly ChatMessage[]
): string {
  const sections: string[] = [];

  if (memories.length > 0) {
    sections.push(["[External Memory]", ...memories].join("\n"));
  }

  if (recentMessages.length > 0) {
    sections.push(
      [
        "[Session History]",
        ...recentMessages.map((message) => `${message.role}: ${message.content}`)
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}
