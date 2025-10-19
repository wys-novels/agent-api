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

  async formatFinalResponse(executionResults: any[], originalMessage: string): Promise<string> {
    const generateCommand = this.findGenerateCommand(originalMessage);
    
    if (!generateCommand) {
      return 'Операция выполнена успешно.';
    }

    const insufficientDataResults = this.filterInsufficientDataResults(executionResults);
    
    if (insufficientDataResults.length > 0) {
      return await this.handleInsufficientData(insufficientDataResults, originalMessage);
    }

    return await this.generateSuccessResponse(executionResults, generateCommand);
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

  private async handleInsufficientData(insufficientDataResults: any[], originalMessage: string): Promise<string> {
    const context = this.buildInsufficientDataContext(insufficientDataResults);
    const prompt = this.buildInsufficientDataPrompt(originalMessage, context);
    
    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: prompt }],
    });
    
    return response.content;
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

Попроси пользователя уточнить недостающую информацию и объясни, что именно нужно для выполнения запроса.

**Правила форматирования:**
- Используй Markdown разметку для лучшей читаемости
- Выделяй важную информацию жирным текстом (**текст**)
- Используй списки для перечисления недостающих данных
- Используй заголовки для структурирования информации
- Выделяй ошибки и предупреждения жирным текстом
- Структурируй ответ с заголовками и подзаголовками`;
  }

  private async generateSuccessResponse(executionResults: any[], generateCommand: any): Promise<string> {
    const resultsContext = this.buildResultsContext(executionResults);
    const prompt = this.buildSuccessPrompt(generateCommand, resultsContext);
    
    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: prompt }],
    });
    
    return response.content;
  }

  private buildResultsContext(executionResults: any[]): string {
    return executionResults.map((result, index) => {
      const status = result.success ? '✅ Успешно' : '❌ Ошибка';
      let requestInfo = '';
      let responseInfo = '';
      
      if (result.success) {
        requestInfo = `Запрос: ${JSON.stringify(result.requestBody || result.requestParameters, null, 2)}`;
        responseInfo = `Ответ: ${JSON.stringify(result.response, null, 2)}`;
      } else {
        // Специальная обработка для INSUFFICIENT_SCHEMA
        if (result.errorType === 'SWAGGER_ERROR' && result.error?.includes('Swagger схема некорректна')) {
          requestInfo = `Запрос: Не выполнен (проблема со схемой)`;
          responseInfo = `Ошибка: ${result.error}`;
        } else {
          requestInfo = `Запрос: ${JSON.stringify(result.requestBody || result.requestParameters, null, 2)}`;
          responseInfo = `Ответ: ${JSON.stringify(result.response, null, 2)}`;
        }
      }
      
      return `Шаг ${result.step}: ${result.method} ${result.endpoint} - ${status}\n` +
             `${requestInfo}\n` +
             `${responseInfo}\n`;
    }).join('\n');
  }

  private buildSuccessPrompt(generateCommand: any, resultsContext: string): string {
    return `${generateCommand.prompt}

Результаты выполнения API вызовов:
${resultsContext}

Сформируй понятный и структурированный ответ пользователю на основе полученных данных.

**Правила форматирования:**
- Используй Markdown разметку для лучшей читаемости
- Форматируй JSON с отступами и переносами строк в блоках кода
- Выделяй код в блоки с указанием языка (json, javascript, etc.)
- Используй списки для перечисления параметров
- Выделяй важную информацию жирным текстом (**текст**)
- Используй заголовки для структурирования информации
- Для JSON используй блоки \`\`\`json ... \`\`\`
- Для HTTP запросов используй блоки \`\`\`http ... \`\`\`
- Структурируй ответ с заголовками и подзаголовками`;
  }
}
