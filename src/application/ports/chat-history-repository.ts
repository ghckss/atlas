export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AppendChatMessageInput {
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ChatHistoryRepository {
  appendMessage(input: AppendChatMessageInput): Promise<ChatMessage>;
  listRecentMessages(
    sessionId: string,
    limit: number
  ): Promise<readonly ChatMessage[]>;
}
