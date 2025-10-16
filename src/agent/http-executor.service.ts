import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OpenAIService } from '../openai/openai.service';
import { SwaggerService } from '../api-registry/swagger.service';
import { ApiCallPlan, ExecutionResult, ParameterValue, ExecutionErrorType, StepContext, StandardizedError, ParameterValidationStatus, ParameterGenerationResult } from './api-planner.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HttpExecutorService {
  private readonly logger = new Logger(HttpExecutorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly openaiService: OpenAIService,
    private readonly swaggerService: SwaggerService,
  ) {}

  async executePlan(plan: ApiCallPlan[], userPrompt: string): Promise<ExecutionResult[]> {
    this.logger.log(`Executing plan with ${plan.length} steps`);

    const results: ExecutionResult[] = [];

    for (const step of plan) {
      try {
        this.logger.log(`Executing step ${step.step}: ${step.method} ${step.endpoint}`);
        
        const result = await this.executeStep(step, results, userPrompt);
        results.push(result);

        if (!result.success) {
          this.logger.error(`Step ${step.step} failed, stopping execution`);
          break;
        }
      } catch (error) {
        this.logger.error(`Error executing step ${step.step}:`, error);
        const standardizedError = this.createStandardizedError(
          ExecutionErrorType.UNKNOWN_ERROR,
          `Ошибка выполнения: ${error.message}`,
          { originalError: error },
          step.step
        );
        
        results.push({
          step: step.step,
          endpoint: step.endpoint,
          method: step.method,
          requestParameters: [],
          requestBody: null,
          response: null,
          responseStatus: 0,
          success: false,
          error: standardizedError.message,
          errorType: standardizedError.type,
          errorDetails: standardizedError.details,
        });
        break;
      }
    }

    return results;
  }

  // Централизованная обработка ошибок
  private createStandardizedError(
    type: ExecutionErrorType,
    message: string,
    details?: any,
    step?: number
  ): StandardizedError {
    return {
      type,
      message,
      details,
      step
    };
  }

  // Форматирование контекста между шагами
  private formatStepContext(previousResults: ExecutionResult[]): string {
    if (previousResults.length === 0) {
      return '[нет предыдущих результатов]';
    }

    return previousResults.map(result => {
      const status = result.success ? 'Успех' : 'Ошибка';
      const context: StepContext = {
        step: result.step,
        method: result.method,
        endpoint: result.endpoint,
        success: result.success,
        response: result.response,
        error: result.error
      };

      return `Шаг ${context.step}: ${context.method} ${context.endpoint} -> ${status}\n` +
             `Ответ: ${JSON.stringify(context.response, null, 2)}`;
    }).join('\n\n');
  }

  private async executeStep(
    step: ApiCallPlan, 
    previousResults: ExecutionResult[], 
    userPrompt: string
  ): Promise<ExecutionResult> {
    // Генерируем параметры для этого шага
    const parameterResult = await this.generateParametersForStep(step, previousResults, userPrompt);

    // Проверяем статус генерации параметров
    if (parameterResult.status === ParameterValidationStatus.INSUFFICIENT_DATA) {
      this.logger.warn(`Insufficient data for step ${step.step}: ${parameterResult.message}`);
      return {
        step: step.step,
        endpoint: step.endpoint,
        method: step.method,
        requestParameters: [],
        requestBody: null,
        response: null,
        responseStatus: 0,
        success: false,
        error: parameterResult.message,
        errorType: ExecutionErrorType.INSUFFICIENT_DATA,
        errorDetails: { message: parameterResult.message }
      };
    }

    if (parameterResult.status === ParameterValidationStatus.ERROR) {
      this.logger.error(`Parameter generation error for step ${step.step}: ${parameterResult.message}`);
      return {
        step: step.step,
        endpoint: step.endpoint,
        method: step.method,
        requestParameters: [],
        requestBody: null,
        response: null,
        responseStatus: 0,
        success: false,
        error: parameterResult.message,
        errorType: ExecutionErrorType.PARAMETER_GENERATION_ERROR,
        errorDetails: { message: parameterResult.message }
      };
    }

    // Выполняем HTTP запрос
    const { response, status } = await this.makeHttpRequest(
      step.baseUrl,
      step.endpoint,
      step.method,
      parameterResult.parameters,
      parameterResult.body
    );

    return {
      step: step.step,
      endpoint: step.endpoint,
      method: step.method,
      requestParameters: parameterResult.parameters,
      requestBody: parameterResult.body,
      response,
      responseStatus: status,
      success: status >= 200 && status < 300,
      error: status >= 400 ? `HTTP ${status}: ${JSON.stringify(response)}` : undefined,
    };
  }

  private async generateParametersForStep(
    step: ApiCallPlan, 
    previousResults: ExecutionResult[], 
    userPrompt: string
  ): Promise<ParameterGenerationResult> {
    
    this.logger.log(`Generating parameters for step ${step.step}`);

    try {
      // Получаем схему из Swagger через SwaggerService
      const swaggerUrl = await this.getSwaggerUrlForStep(step);
      if (!swaggerUrl) {
        throw this.createStandardizedError(
          ExecutionErrorType.SWAGGER_ERROR,
          `No swagger URL found for step ${step.step}`,
          { step: step.step }
        );
      }

      const swaggerSchema = await this.swaggerService.getEndpointSchema(
        swaggerUrl, 
        step.endpoint, 
        step.method
      );

      if (!swaggerSchema) {
        throw this.createStandardizedError(
          ExecutionErrorType.SWAGGER_ERROR,
          `Endpoint ${step.method} ${step.endpoint} not found in Swagger`,
          { step: step.step, endpoint: step.endpoint, method: step.method }
        );
      }

      // Формируем контекст из предыдущих результатов
      const previousResultsText = this.formatStepContext(previousResults);

      // Формируем описание схемы body через SwaggerService
      const bodyDescription = this.swaggerService.formatRequestBodySchema(swaggerSchema.requestBody);

      const prompt = `Сгенерируй параметры и body для HTTP запроса.

Эндпоинт: ${step.method} ${step.endpoint}
Описание: ${step.description}

Схема параметров:
Query: ${JSON.stringify(swaggerSchema.parameters?.filter(p => p.in === 'query') || [], null, 2)}
Path: ${JSON.stringify(swaggerSchema.parameters?.filter(p => p.in === 'path') || [], null, 2)}
Header: ${JSON.stringify(swaggerSchema.parameters?.filter(p => p.in === 'header') || [], null, 2)}

Схема Body (JSON):
${bodyDescription}

Запрос пользователя: "${userPrompt}"

Предыдущие результаты:
${previousResultsText}

ВАЖНО: 
- Сначала определи, достаточно ли данных для выполнения запроса
- Если в схеме есть обязательные поля (required), но в запросе пользователя их нет - используй статус INSUFFICIENT_DATA
- Если данных достаточно - используй статус SUCCESS и заполни все параметры
- Извлекай значения из запроса пользователя или используй разумные значения по умолчанию
- Для timezone используй значения типа "Europe/Moscow", "UTC", "America/New_York"

Верни ТОЛЬКО валидный JSON без markdown блоков:

Если данных достаточно:
{
  "status": "SUCCESS",
  "parameters": [
    {"name": "param", "value": "value", "location": "query"}
  ],
  "body": {
    "key": "value"
  }
}

Если данных недостаточно:
{
  "status": "INSUFFICIENT_DATA",
  "message": "Для выполнения запроса не хватает данных: [укажи что именно нужно]",
  "parameters": [],
  "body": {}
}`;

      this.logger.log(`Prompt for step ${step.step}: ${prompt.substring(0, 500)}...`);

      const response = await this.openaiService.generateAnswer({
        messages: [{ role: 'user', content: prompt }],
      });

      this.logger.log(`AI Response for step ${step.step}: ${response.content}`);

      // Извлекаем JSON из markdown блока если есть
      let jsonContent = response.content;
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      
      const parsed = JSON.parse(jsonContent);
      this.logger.log(`Parsed parameters for step ${step.step}: ${JSON.stringify(parsed)}`);
      
      // Проверяем статус ответа
      const status = parsed.status as ParameterValidationStatus;
      
      if (status === ParameterValidationStatus.INSUFFICIENT_DATA) {
        this.logger.warn(`Insufficient data for step ${step.step}: ${parsed.message}`);
        return {
          status: ParameterValidationStatus.INSUFFICIENT_DATA,
          parameters: [],
          body: null,
          message: parsed.message
        };
      }
      
      return {
        status: status || ParameterValidationStatus.SUCCESS,
        parameters: parsed.parameters || [],
        body: parsed.body || null,
      };

    } catch (error) {
      this.logger.error(`Failed to generate parameters for step ${step.step}: ${error.message}`);
      
      // Возвращаем ошибку в случае парсинга
      return {
        status: ParameterValidationStatus.ERROR,
        parameters: [],
        body: null,
        message: `Ошибка парсинга ответа ИИ: ${error.message}`
      };
    }
  }

  private async makeHttpRequest(
    baseUrl: string,
    endpoint: string,
    method: string,
    parameters: ParameterValue[],
    body: any
  ): Promise<{ response: any; status: number }> {
    this.logger.log(`Making HTTP ${method} request to ${baseUrl}${endpoint}`);

    try {
      const requestBuilder = new HttpRequestBuilder(baseUrl, endpoint, method);
      const { url, headers } = requestBuilder.buildRequest(parameters, body);

      // Выполняем запрос
      const response = await firstValueFrom(
        this.httpService.request({
          method: method.toLowerCase() as any,
          url,
          headers,
          data: body,
        })
      );

      return {
        response: response.data,
        status: response.status,
      };
    } catch (error) {
      this.logger.error(`HTTP request failed: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}, data: ${JSON.stringify(error.response.data)}`);
        return {
          response: error.response.data,
          status: error.response.status,
        };
      } else {
        throw error;
      }
    }
  }

  private async getSwaggerUrlForStep(step: ApiCallPlan): Promise<string | null> {
    if (!step.swaggerUrl) {
      this.logger.warn(`No swagger URL provided for step ${step.step}`);
      return null;
    }
    
    this.logger.log(`Using swagger URL for step ${step.step}: ${step.swaggerUrl}`);
    return step.swaggerUrl;
  }

}

// Вспомогательный класс для построения HTTP запросов
class HttpRequestBuilder {
  constructor(
    private baseUrl: string,
    private endpoint: string,
    private method: string
  ) {}

  buildRequest(parameters: ParameterValue[], body: any): { url: string; headers: any } {
    // Подготавливаем URL с query параметрами
    let url = `${this.baseUrl}${this.endpoint}`;
    const queryParams = parameters.filter(p => p.location === 'query');
    if (queryParams.length > 0) {
      const queryString = queryParams
        .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.value))}`)
        .join('&');
      url += `?${queryString}`;
    }

    // Подготавливаем headers
    const headers: any = {};
    parameters.filter(p => p.location === 'header').forEach(p => {
      headers[p.name] = String(p.value);
    });

    // Подготавливаем path параметры
    let finalUrl = url;
    parameters.filter(p => p.location === 'path').forEach(p => {
      finalUrl = finalUrl.replace(`{${p.name}}`, String(p.value));
    });

    return {
      url: finalUrl,
      headers
    };
  }
}
