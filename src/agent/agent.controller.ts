import { Controller, Get, Query, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly openaiService: OpenAIService) {}

  @Get('query')
  async query(@Query('message') message: string): Promise<{ response: string }> {
    this.logger.log(`Processing query: ${message}`);

    if (!message) {
      throw new Error('Message parameter is required');
    }

    try {
      const result = await this.openaiService.generateAnswer({
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      return {
        response: result.content,
      };
    } catch (error) {
      this.logger.error('Error processing query:', error);
      throw error;
    }
  }
}
