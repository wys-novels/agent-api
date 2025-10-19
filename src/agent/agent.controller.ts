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
    finalResponse?: string;
  }> {
    this.logger.log(`Processing query: ${message}`);

    if (!message) {
      throw new Error('Message parameter is required');
    }

    try {
      // 1. Прямая классификация запроса без reasoning анализа
      this.logger.log('Classifying request directly...');
      
      const classification = await this.classifierService.classifyRequest(message);
      
      // Проверяем, есть ли HTTP_TOOL команды
      const hasHttpTool = classification.tasks.some(task => task.command === 'HTTP_TOOL');
      
      let apiPlan: any = null;
      let executionResults: any = null;
      
      if (hasHttpTool) {
        try {
          this.logger.log('Generating API plan for HTTP_TOOL commands');
          // Собираем все HTTP_TOOL задачи для планировщика
          const httpToolTasks = classification.tasks.filter(task => task.command === 'HTTP_TOOL');
          const planPrompt = httpToolTasks.length > 0 
            ? httpToolTasks.map(task => task.prompt).join('\n\n')
            : message;
          
          this.logger.log(`Planning for ${httpToolTasks.length} HTTP_TOOL tasks`);
          this.logger.log(`HTTP_TOOL tasks: ${httpToolTasks.map(task => task.prompt).join(' | ')}`);
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
        tasks: classification.tasks
      };
      
      if (apiPlan) {
        result.apiPlan = apiPlan;
      }
      
      if (executionResults) {
        result.executionResults = executionResults;
        
        // Генерируем финальный ответ на основе результатов выполнения
        try {
          const finalResponse = await this.generateFinalResponse(executionResults, message);
          result.finalResponse = finalResponse;
        } catch (error) {
          this.logger.warn('Failed to generate final response:', error);
        }
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error processing query:', error);
      throw error;
    }
  }

  private async generateFinalResponse(executionResults: any[], originalMessage: string): Promise<string> {
    // Находим GENERATE команду для финального ответа
    const generateTask = await this.classifierService.classifyRequest(originalMessage);
    const generateCommand = generateTask.tasks.find(task => task.command === 'GENERATE');
    
    if (!generateCommand) {
      return 'Операция выполнена успешно.';
    }

    // Проверяем, есть ли ошибки недостатка данных
    const insufficientDataResults = executionResults.filter(result => 
      result.errorType === 'INSUFFICIENT_DATA'
    );

    if (insufficientDataResults.length > 0) {
      // Формируем специальный контекст для случая недостатка данных
      const insufficientDataContext = insufficientDataResults.map(result => 
        `Шаг ${result.step}: ${result.method} ${result.endpoint} - ❌ Недостаточно данных\n` +
        `Причина: ${result.error}\n`
      ).join('\n');

      const prompt = `Пользователь запросил: "${originalMessage}"

Для выполнения запроса не хватает данных:
${insufficientDataContext}

Попроси пользователя уточнить недостающую информацию и объясни, что именно нужно для выполнения запроса.`;

      const response = await this.openaiService.generateAnswer({
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content;
    }

    // Формируем обычный контекст с результатами выполнения
    const resultsContext = executionResults.map((result, index) => {
      const status = result.success ? '✅ Успешно' : '❌ Ошибка';
      return `Шаг ${result.step}: ${result.method} ${result.endpoint} - ${status}\n` +
             `Запрос: ${JSON.stringify(result.requestBody || result.requestParameters, null, 2)}\n` +
             `Ответ: ${JSON.stringify(result.response, null, 2)}\n`;
    }).join('\n');

    const prompt = `${generateCommand.prompt}

Результаты выполнения API вызовов:
${resultsContext}

Сформируй понятный и структурированный ответ пользователю на основе полученных данных.`;

    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content;
  }

}
