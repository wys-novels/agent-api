import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { ClassifierService } from '../classifier/classifier.service';

@Injectable()
export class ResponseFormatterService {
  private readonly logger = new Logger(ResponseFormatterService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly classifierService: ClassifierService,
  ) {}

  formatFinalResponse(executionResults: any[], originalMessage: string): string {
    const generateCommand = this.findGenerateCommand(originalMessage);
    
    if (!generateCommand) {
      return 'Операция выполнена успешно.';
    }

    const insufficientDataResults = this.filterInsufficientDataResults(executionResults);
    
    if (insufficientDataResults.length > 0) {
      return this.handleInsufficientData(insufficientDataResults, originalMessage);
    }

    return this.generateSuccessResponse(executionResults, generateCommand);
  }

  private findGenerateCommand(originalMessage: string) {
    // Упрощенная логика - в реальном коде здесь был бы вызов classifierService
    return { prompt: 'Сформировать ответ пользователю' };
  }

  private filterInsufficientDataResults(executionResults: any[]) {
    return executionResults.filter(result => 
      result.errorType === 'INSUFFICIENT_DATA'
    );
  }

  private handleInsufficientData(insufficientDataResults: any[], originalMessage: string): string {
    const context = this.buildInsufficientDataContext(insufficientDataResults);
    const prompt = this.buildInsufficientDataPrompt(originalMessage, context);
    
    // В реальном коде здесь был бы вызов openaiService
    return `Для выполнения запроса не хватает данных. ${context}`;
  }

  private buildInsufficientDataContext(results: any[]): string {
    return results.map(result => 
      `Шаг ${result.step}: ${result.method} ${result.endpoint} - ❌ Недостаточно данных\n` +
      `Причина: ${result.error}\n`
    ).join('\n');
  }

  private buildInsufficientDataPrompt(originalMessage: string, context: string): string {
    return `Пользователь запросил: "${originalMessage}"

Для выполнения запроса не хватает данных:
${context}

Попроси пользователя уточнить недостающую информацию и объясни, что именно нужно для выполнения запроса.`;
  }

  private generateSuccessResponse(executionResults: any[], generateCommand: any): string {
    const resultsContext = this.buildResultsContext(executionResults);
    const prompt = this.buildSuccessPrompt(generateCommand, resultsContext);
    
    // В реальном коде здесь был бы вызов openaiService
    return `Операция выполнена успешно. Результаты: ${resultsContext}`;
  }

  private buildResultsContext(executionResults: any[]): string {
    return executionResults.map((result, index) => {
      const status = result.success ? '✅ Успешно' : '❌ Ошибка';
      return `Шаг ${result.step}: ${result.method} ${result.endpoint} - ${status}\n` +
             `Запрос: ${JSON.stringify(result.requestBody || result.requestParameters, null, 2)}\n` +
             `Ответ: ${JSON.stringify(result.response, null, 2)}\n`;
    }).join('\n');
  }

  private buildSuccessPrompt(generateCommand: any, resultsContext: string): string {
    return `${generateCommand.prompt}

Результаты выполнения API вызовов:
${resultsContext}

Сформируй понятный и структурированный ответ пользователю на основе полученных данных.`;
  }
}
