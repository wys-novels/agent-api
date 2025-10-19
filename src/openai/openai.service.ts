import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '../config/config.service';
import { IOpenAIService, IChatRequest, IChatResponse } from './openai.interface';
import { ERROR_MESSAGES } from '../agent/constants/http.constants';

@Injectable()
export class OpenAIService implements IOpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;
  private lastApiKey: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private async ensureClient(): Promise<void> {
    const apiKey = await this.config.getOpenAIApiKey();
    
    if (!apiKey) {
      throw new Error(ERROR_MESSAGES.OPENAI_API_KEY_NOT_CONFIGURED);
    }

    // Пересоздаём клиента только если ключ изменился
    if (!this.client || apiKey !== this.lastApiKey) {
      this.logger.log('Initializing OpenAI client');
      this.client = new OpenAI({ apiKey });
      this.lastApiKey = apiKey;
    }
  }

  async generateAnswer(request: IChatRequest): Promise<IChatResponse> {
    await this.ensureClient();
    
    // Получаем актуальные параметры из Vault при каждом запросе
    const config = await this.config.getOpenAIConfig();
    
    const model = request.model || config.model;
    const temperature = request.temperature ?? config.temperature;
    const maxTokens = request.maxTokens || config.maxTokens;
    
    this.logger.log(`Generating answer with model: ${model}`);
    
    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages: request.messages,
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error(ERROR_MESSAGES.NO_CONTENT_RECEIVED);
      }

      return {
        content,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      this.logger.error('Error generating answer with OpenAI', error);
      throw error;
    }
  }
}
