import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { ApiRegistryService } from '../api-registry/api-registry.service';
import { 
  IntentAnalysis, 
  ReasoningResult, 
  ContextualInfo, 
  ReasoningPrompt 
} from './reasoning.interface';
import { REASONING_SYSTEM_PROMPT, REASONING_ANALYSIS_PROMPT } from './prompts/reasoning-system.prompt';

@Injectable()
export class ReasoningService {
  private readonly logger = new Logger(ReasoningService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly apiRegistryService: ApiRegistryService,
  ) {}

  async analyze(userMessage: string): Promise<ReasoningResult> {
    this.logger.log(`Starting reasoning analysis for: ${userMessage}`);

    try {
      // Получаем контекстную информацию
      const context = await this.buildContext();
      
      // Анализируем намерение
      const analysis = await this.analyzeIntent(userMessage, context);
      
      // Проверяем корректность запроса
      const shouldProceed = this.validateRequest(analysis);
      
      // Обогащаем контекст если нужно
      const enrichedRequest = this.enrichContext(analysis, context);
      
      // Формируем рекомендации
      const recommendations = this.generateRecommendations(analysis, shouldProceed);

      const result: ReasoningResult = {
        shouldProceed,
        enrichedRequest,
        analysis,
        recommendations
      };

      this.logger.log(`Reasoning analysis completed. Should proceed: ${shouldProceed}`);
      this.logger.log(`Enriched request: ${enrichedRequest}`);
      
      return result;

    } catch (error) {
      this.logger.error(`Error in reasoning analysis: ${error.message}`);
      
      // В случае ошибки возвращаем безопасный результат
      return {
        shouldProceed: true,
        enrichedRequest: userMessage,
        analysis: {
          originalRequest: userMessage,
          interpretedIntent: userMessage,
          confidence: 0.5,
          assumptions: [],
          missingData: [],
          contextualNotes: ['Ошибка анализа, используем исходный запрос']
        },
        recommendations: []
      };
    }
  }

  private async buildContext(): Promise<ContextualInfo> {
    try {
      // Получаем список доступных API
      const apis = await this.apiRegistryService.findAll();
      const availableApis = apis.map(api => api.name);

      return {
        availableApis,
        systemConstraints: [
          'Только чтение данных (GET запросы)',
          'Требуется аутентификация',
          'Ограниченный доступ к персональным данным'
        ]
      };
    } catch (error) {
      this.logger.warn(`Failed to build context: ${error.message}`);
      return {
        availableApis: [],
        systemConstraints: ['Система недоступна']
      };
    }
  }

  private async analyzeIntent(userMessage: string, context: ContextualInfo): Promise<IntentAnalysis> {
    this.logger.log(`Analyzing intent for: ${userMessage}`);

    try {
      // Формируем промпт для анализа
      const prompt = REASONING_ANALYSIS_PROMPT
        .replace('{userMessage}', userMessage)
        .replace('{availableApis}', context.availableApis.join(', '))
        .replace('{context}', JSON.stringify(context, null, 2));

      // Отправляем запрос к ИИ
      const response = await this.openaiService.generateAnswer({
        messages: [
          { role: 'system', content: REASONING_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
      });

      this.logger.log(`AI reasoning response: ${response.content}`);

      // Парсим JSON ответ
      const parsed = this.parseReasoningResponse(response.content);
      
      return {
        originalRequest: userMessage,
        interpretedIntent: parsed.interpretedIntent,
        confidence: parsed.confidence,
        assumptions: parsed.assumptions || [],
        missingData: parsed.missingData || [],
        contextualNotes: parsed.contextualNotes || []
      };

    } catch (error) {
      this.logger.error(`Error analyzing intent: ${error.message}`);
      
      // Возвращаем базовый анализ в случае ошибки
      return {
        originalRequest: userMessage,
        interpretedIntent: userMessage,
        confidence: 0.5,
        assumptions: [],
        missingData: [],
        contextualNotes: ['Ошибка анализа намерения']
      };
    }
  }

  private parseReasoningResponse(content: string): any {
    try {
      // Извлекаем JSON из markdown блока если есть
      let jsonContent = content;
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      
      return JSON.parse(jsonContent);
    } catch (error) {
      this.logger.error(`Failed to parse reasoning response: ${error.message}`);
      throw new Error(`Invalid reasoning response format: ${error.message}`);
    }
  }

  private validateRequest(analysis: IntentAnalysis): boolean {
    // Проверяем, есть ли критические недостающие данные
    if (analysis.missingData.length > 0) {
      this.logger.warn(`Missing critical data: ${analysis.missingData.join(', ')}`);
      
      // Если недостает критически важных данных, не продолжаем
      const criticalMissing = analysis.missingData.some(data => 
        data.toLowerCase().includes('id') || 
        data.toLowerCase().includes('identifier') ||
        data.toLowerCase().includes('uuid')
      );
      
      if (criticalMissing) {
        return false;
      }
    }

    // Проверяем уверенность в интерпретации
    if (analysis.confidence < 0.3) {
      this.logger.warn(`Low confidence in interpretation: ${analysis.confidence}`);
      return false;
    }

    return true;
  }

  private enrichContext(analysis: IntentAnalysis, context: ContextualInfo): string {
    let enrichedRequest = analysis.originalRequest;

    // Если есть недостающие данные, пытаемся их дополнить из контекста
    if (analysis.missingData.length > 0) {
      this.logger.log(`Enriching context for missing data: ${analysis.missingData.join(', ')}`);
      
      // Добавляем контекстуальные заметки к запросу
      if (analysis.contextualNotes.length > 0) {
        enrichedRequest += `\n\nКонтекст: ${analysis.contextualNotes.join('; ')}`;
      }
    }

    // Если есть предположения, добавляем их
    if (analysis.assumptions.length > 0) {
      this.logger.log(`Adding assumptions: ${analysis.assumptions.join(', ')}`);
      enrichedRequest += `\n\nПредположения: ${analysis.assumptions.join('; ')}`;
    }

    return enrichedRequest;
  }

  private generateRecommendations(analysis: IntentAnalysis, shouldProceed: boolean): string[] {
    const recommendations: string[] = [];

    if (!shouldProceed) {
      if (analysis.missingData.length > 0) {
        recommendations.push(`Для выполнения запроса необходимо указать: ${analysis.missingData.join(', ')}`);
      }
      
      if (analysis.confidence < 0.3) {
        recommendations.push('Запрос неясен. Пожалуйста, уточните, что именно вы хотите узнать или сделать.');
      }
    }

    if (analysis.assumptions.length > 0) {
      recommendations.push(`Я сделал следующие предположения: ${analysis.assumptions.join(', ')}`);
    }

    return recommendations;
  }
}
