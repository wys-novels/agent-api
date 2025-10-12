import { Controller, Get, Query, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { ClassifierService } from '../classifier/classifier.service';

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly classifierService: ClassifierService,
  ) {}

  @Get('query')
  async query(@Query('message') message: string): Promise<{ tasks: Array<{ command: string; prompt: string }> }> {
    this.logger.log(`Processing query: ${message}`);

    if (!message) {
      throw new Error('Message parameter is required');
    }

    try {
      const classification = await this.classifierService.classifyRequest(message);
      
      return {
        tasks: classification.tasks,
      };
    } catch (error) {
      this.logger.error('Error processing query:', error);
      throw error;
    }
  }
}
