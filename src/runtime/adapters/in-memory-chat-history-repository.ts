import type {
  AppendChatMessageInput,
  ChatHistoryRepository,
  ChatMessage
} from "../../application";

export class InMemoryChatHistoryRepository implements ChatHistoryRepository {
  private readonly messages: ChatMessage[] = [];

  async appendMessage(input: AppendChatMessageInput): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: `message-${this.messages.length + 1}`,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata,
      createdAt: new Date()
    };

    this.messages.push(message);
    return message;
  }

  async listRecentMessages(
    sessionId: string,
    limit: number
  ): Promise<readonly ChatMessage[]> {
    return this.messages
      .filter((message) => message.sessionId === sessionId)
      .slice(-limit);
  }
}
