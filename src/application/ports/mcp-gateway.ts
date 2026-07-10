import type { McpKind } from "../../domain";

export interface McpGatewayRequest<TInput = unknown> {
  kind: McpKind;
  operation: string;
  input: TInput;
}

export interface McpGateway {
  execute<TInput, TOutput>(
    request: McpGatewayRequest<TInput>
  ): Promise<TOutput>;
}
