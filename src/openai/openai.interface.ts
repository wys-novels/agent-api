export interface IChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface IChatRequest {
  messages: IChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface IChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IOpenAIService {
  generateAnswer(request: IChatRequest): Promise<IChatResponse>;
}
