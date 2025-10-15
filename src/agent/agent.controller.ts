import { Controller, Get, Query, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { ClassifierService } from '../classifier/classifier.service';
import { ApiPlannerService } from './api-planner.service';
import { HttpExecutorService } from './http-executor.service';
import { Command } from '../classifier/classifier.enum';

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly classifierService: ClassifierService,
    private readonly apiPlannerService: ApiPlannerService,
    private readonly httpExecutorService: HttpExecutorService,
  ) {}

  @Get('query')
  async query(@Query('message') message: string): Promise<{ 
    tasks: Array<{ command: string; prompt: string }>;
    apiPlan?: any;
    executionResults?: any;
  }> {
    this.logger.log(`Processing query: ${message}`);

    if (!message) {
      throw new Error('Message parameter is required');
    }

    try {
      const classification = await this.classifierService.classifyRequest(message);
      
      // Проверяем, есть ли HTTP_TOOL команды
      const hasHttpTool = classification.tasks.some(task => task.command === 'HTTP_TOOL');
      
      let apiPlan: any = null;
      let executionResults: any = null;
      
      if (hasHttpTool) {
        try {
          this.logger.log('Generating API plan for HTTP_TOOL commands');
          // Используем промпт из HTTP_TOOL команды для построения плана
          const httpToolTask = classification.tasks.find(task => task.command === 'HTTP_TOOL');
          const planPrompt = httpToolTask ? httpToolTask.prompt : message;
          
          apiPlan = await this.apiPlannerService.planApiCalls(planPrompt);
          
          // Выполняем план
          if (apiPlan && apiPlan.plan && apiPlan.plan.length > 0) {
            this.logger.log('Executing API plan');
            executionResults = await this.httpExecutorService.executePlan(apiPlan.plan, planPrompt);
          }
        } catch (error) {
          this.logger.warn('Failed to generate or execute API plan:', error);
          // Продолжаем без плана, если не удалось его сгенерировать
        }
      }
      
      const result: any = {
        tasks: classification.tasks,
      };
      
      if (apiPlan) {
        result.apiPlan = apiPlan;
      }
      
      if (executionResults) {
        result.executionResults = executionResults;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error processing query:', error);
      throw error;
    }
  }

}
