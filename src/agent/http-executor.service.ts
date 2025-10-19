import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OpenAIService } from '../openai/openai.service';
import { SwaggerService } from '../api-registry/swagger.service';
import { ApiCallPlan, ExecutionResult, ParameterValue, ExecutionErrorType, StepContext, StandardizedError, ParameterValidationStatus, ParameterGenerationResult } from './api-planner.interface';
import { HTTP_STATUS, ERROR_MESSAGES } from './constants/http.constants';
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
    const parameterResult = await this.generateParametersForStep(step, previousResults, userPrompt);
    
    const validationResult = this.validateParameterResult(parameterResult, step);
    if (validationResult) {
      return validationResult;
    }

    const httpResult = await this.makeHttpRequest(
      step.baseUrl,
      step.endpoint,
      step.method,
      parameterResult.parameters,
      parameterResult.body
    );

    return this.buildExecutionResult(step, parameterResult, httpResult);
  }

  private validateParameterResult(parameterResult: ParameterGenerationResult, step: ApiCallPlan): ExecutionResult | null {
    if (parameterResult.status === ParameterValidationStatus.INSUFFICIENT_DATA) {
      this.logger.warn(`Insufficient data for step ${step.step}: ${parameterResult.message || 'Unknown error'}`);
      return this.createErrorResult(step, ExecutionErrorType.INSUFFICIENT_DATA, parameterResult.message || 'Insufficient data');
    }

    if (parameterResult.status === ParameterValidationStatus.INSUFFICIENT_SCHEMA) {
      this.logger.warn(`Insufficient schema for step ${step.step}: ${parameterResult.message || 'Unknown error'}`);
      return this.createErrorResult(step, ExecutionErrorType.SWAGGER_ERROR, parameterResult.message || 'Insufficient schema');
    }

    if (parameterResult.status === ParameterValidationStatus.ERROR) {
      this.logger.error(`Parameter generation error for step ${step.step}: ${parameterResult.message || 'Unknown error'}`);
      return this.createErrorResult(step, ExecutionErrorType.PARAMETER_GENERATION_ERROR, parameterResult.message || 'Parameter generation error');
    }

    return null;
  }

  private createErrorResult(step: ApiCallPlan, errorType: ExecutionErrorType, message: string): ExecutionResult {
    return {
      step: step.step,
      endpoint: step.endpoint,
      method: step.method,
      requestParameters: [],
      requestBody: null,
      response: null,
      responseStatus: 0,
      success: false,
      error: message,
      errorType,
      errorDetails: { message }
    };
  }

  private buildExecutionResult(step: ApiCallPlan, parameterResult: ParameterGenerationResult, httpResult: { response: any; status: number }): ExecutionResult {
    const isSuccess = httpResult.status >= HTTP_STATUS.SUCCESS_MIN && httpResult.status <= HTTP_STATUS.SUCCESS_MAX;
    
    return {
      step: step.step,
      endpoint: step.endpoint,
      method: step.method,
      requestParameters: parameterResult.parameters,
      requestBody: parameterResult.body,
      response: httpResult.response,
      responseStatus: httpResult.status,
      success: isSuccess,
      error: !isSuccess ? `HTTP ${httpResult.status}: ${JSON.stringify(httpResult.response)}` : undefined,
    };
  }

  private async generateParametersForStep(
    step: ApiCallPlan, 
    previousResults: ExecutionResult[], 
    userPrompt: string
  ): Promise<ParameterGenerationResult> {
    this.logger.log(`Generating parameters for step ${step.step}`);

    try {
      const swaggerSchema = await this.getSwaggerSchema(step);
      const context = this.buildParameterContext(step, swaggerSchema, previousResults, userPrompt);
      const response = await this.getAIResponse(context);
      return this.parseParameterResponse(response, step);
    } catch (error) {
      this.logger.error(`Failed to generate parameters for step ${step.step}: ${error.message}`);
      return this.createParameterError(error.message);
    }
  }

  private async getSwaggerSchema(step: ApiCallPlan) {
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

    return swaggerSchema;
  }

  private buildParameterContext(step: ApiCallPlan, swaggerSchema: any, previousResults: ExecutionResult[], userPrompt: string): string {
    const previousResultsText = this.formatStepContext(previousResults);
    const bodyDescription = this.swaggerService.formatRequestBodySchema(swaggerSchema.requestBody, swaggerSchema.swaggerJson);
    
    // Логирование для отладки
    this.logger.log(`Swagger schema for step ${step.step}:`, JSON.stringify(swaggerSchema, null, 2));
    this.logger.log(`Body description for step ${step.step}:`, bodyDescription);
  
    return `
  <task>
    Сгенерируй параметры и тело (body) для HTTP запроса на основе приведённых данных.
  </task>
  
  <endpoint>
    <method>${step.method}</method>
    <url>${step.endpoint}</url>
    <description>${step.description}</description>
  </endpoint>
  
  <schema>
    <parameters>
      <query>${JSON.stringify(swaggerSchema.parameters?.filter(p => p.in === 'query') || [], null, 2)}</query>
      <path>${JSON.stringify(swaggerSchema.parameters?.filter(p => p.in === 'path') || [], null, 2)}</path>
      <header>${JSON.stringify(swaggerSchema.parameters?.filter(p => p.in === 'header') || [], null, 2)}</header>
    </parameters>
  
    <body>
      ${bodyDescription}
    </body>
  </schema>
  
  <context>
    <userPrompt>${userPrompt}</userPrompt>
    <previousResults>${previousResultsText}</previousResults>
  </context>
  
  <generationRules>
    Если метод запроса — POST, PUT или PATCH, и для обязательных полей нет значений в пользовательском запросе:
    - Сначала ищи недостающие значения в:
      1) запросе пользователя,
      2) предыдущих результатах,
      3) схеме параметров и тела запроса (типы, описания, enum, примеры, pattern).
    - Соблюдай типы/описания/ограничения из схемы. Не придумывай форматы, если они не указаны.
    - Идентификаторы ресурсов (например: id, userId, groupId, sleepId):
      • Если это ссылка на уже существующую сущность (в path, query или body) — бери только из предусловий или previousResults.  
        Если такого значения нет — верни INSUFFICIENT_DATA и явно укажи, какой id требуется.
      • Если это ресурс создаётся и id генерируется сервером — не включай поле id в тело запроса, если оно не помечено как required/ client-supplied.
      • Если поле — неидентифицирующий служебный ключ (например, idempotencyKey, requestId, correlationId) и схема допускает клиентское значение — можно сгенерировать безопасный уникальный токен (например, UUID-строку), следуя pattern/format из схемы. Если требований нет — используй простую уникальную строку-плейсхолдер.
    - Для прочих полей, без которых запрос возможен, можно подставить простые реалистичные примеры, совместимые со схемой:
      • Строки: "example", "test", "note"
      • Числа: 1–10
      • Логические: true/false
    - Не выдумывай новые поля, которых нет в схеме. Не изменяй смысл запроса.
    - Если endpoint содержит {path-параметры} и их значения неизвестны — верни INSUFFICIENT_DATA (не подставляй вымышленные id).
  </generationRules>

  
  <criticalRules>
    - ВНИМАТЕЛЬНО изучи endpoint: ${step.endpoint}
    - Если в endpoint есть {параметр} (например, {id}, {userId}), то ОБЯЗАТЕЛЬНО создай параметр с location: "path"
    - Path параметры ОБЯЗАТЕЛЬНЫ для замены {параметр} в URL
    - Сначала определи, достаточно ли данных для выполнения запроса
    - Если в схеме есть обязательные поля (required), но в запросе пользователя их нет — используй статус INSUFFICIENT_DATA
    - Если данных достаточно — используй статус SUCCESS и заполни все параметры
    - Извлекай значения из запроса пользователя или используй разумные значения по умолчанию
    - Для timezone используй значения "Europe/Moscow", "UTC", "America/New_York"
    - Если для POST/PUT/PATCH запроса схема body пустая или отсутствует, но по логике должен быть body — используй статус INSUFFICIENT_SCHEMA с сообщением "Swagger схема некорректна: отсутствует описание body для ${step.method} запроса"
  </criticalRules>
  
  <examples>
    <pathExamples>
      Если endpoint: "/users/{id}/profile" -> создай параметр {"name": "id", "value": "123", "location": "path"}
      Если endpoint: "/sleep-groups/{id}/sleeps" -> создай параметр {"name": "id", "value": "456", "location": "path"}
    </pathExamples>
  </examples>
  
  <outputFormat>
    Верни ТОЛЬКО валидный JSON без markdown и текста вне JSON:
  
    Если данных достаточно:
    {
      "status": "SUCCESS",
      "parameters": [
        {"name": "param", "value": "value", "location": "query"},
        {"name": "id", "value": "123", "location": "path"}
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
    }

    Если схема Swagger некорректна:
    {
      "status": "INSUFFICIENT_SCHEMA",
      "message": "Swagger схема некорректна: отсутствует описание body для POST запроса",
      "parameters": [],
      "body": {}
    }
  </outputFormat>
  `;
  }

  private async getAIResponse(prompt: string) {
    this.logger.log(`Full Prompt:\n${prompt}`);
    
    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: prompt }],
    });

    this.logger.log(`AI Response: ${response.content}`);
    return response.content;
  }

  private parseParameterResponse(response: string, step: ApiCallPlan): ParameterGenerationResult {
    const jsonContent = this.extractJsonFromResponse(response);
    const parsed = JSON.parse(jsonContent);
    
    this.logger.log(`Parsed parameters for step ${step.step}: ${JSON.stringify(parsed)}`);
    this.logPathParameters(parsed, step);
    
    return this.buildParameterResult(parsed);
  }

  private extractJsonFromResponse(response: string): string {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    return jsonMatch ? jsonMatch[1] : response;
  }

  private logPathParameters(parsed: any, step: ApiCallPlan) {
    const pathParams = parsed.parameters?.filter((p: any) => p.location === 'path') || [];
    if (pathParams.length > 0) {
      this.logger.log(`Generated path parameters for step ${step.step}:`, pathParams);
    } else {
      this.logger.warn(`No path parameters generated for step ${step.step} with endpoint: ${step.endpoint}`);
    }
  }

  private buildParameterResult(parsed: any): ParameterGenerationResult {
    const status = parsed.status as ParameterValidationStatus;
    
    if (status === ParameterValidationStatus.INSUFFICIENT_DATA) {
      this.logger.warn(`Insufficient data: ${parsed.message}`);
      return {
        status: ParameterValidationStatus.INSUFFICIENT_DATA,
        parameters: [],
        body: null,
        message: parsed.message
      };
    }
    
    if (status === ParameterValidationStatus.INSUFFICIENT_SCHEMA) {
      this.logger.warn(`Insufficient schema: ${parsed.message}`);
      return {
        status: ParameterValidationStatus.INSUFFICIENT_SCHEMA,
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
  }

  private createParameterError(message: string): ParameterGenerationResult {
    return {
      status: ParameterValidationStatus.ERROR,
      parameters: [],
      body: null,
      message: `Ошибка парсинга ответа ИИ: ${message}`
    };
  }

  private async makeHttpRequest(
    baseUrl: string,
    endpoint: string,
    method: string,
    parameters: ParameterValue[],
    body: any
  ): Promise<{ response: any; status: number }> {
    this.logger.log(`Making HTTP ${method} request to ${baseUrl}${endpoint}`);

    // Валидация path параметров
    const pathParams = parameters.filter(p => p.location === 'path');
    const missingPathParams = this.validatePathParameters(endpoint, pathParams);
    
    if (missingPathParams.length > 0) {
      this.logger.error(`Missing path parameters: ${missingPathParams.join(', ')}`);
      throw new Error(`Missing required path parameters: ${missingPathParams.join(', ')}`);
    }

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

  private validatePathParameters(endpoint: string, pathParams: ParameterValue[]): string[] {
    const missingParams: string[] = [];
    
    // Находим все {параметр} в endpoint
    const pathParamMatches = endpoint.match(/\{([^}]+)\}/g);
    if (!pathParamMatches) {
      return missingParams; // Нет path параметров
    }
    
    // Извлекаем имена параметров
    const requiredParams = pathParamMatches.map(match => match.slice(1, -1)); // убираем { и }
    
    // Проверяем, есть ли все необходимые параметры
    for (const requiredParam of requiredParams) {
      const hasParam = pathParams.some(param => param.name === requiredParam);
      if (!hasParam) {
        missingParams.push(requiredParam);
      }
    }
    
    return missingParams;
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
    console.log(`[HttpRequestBuilder] Building request for endpoint: ${this.endpoint}`);
    console.log(`[HttpRequestBuilder] Parameters received:`, JSON.stringify(parameters, null, 2));
    
    // Подготавливаем URL с query параметрами
    let url = `${this.baseUrl}${this.endpoint}`;
    console.log(`[HttpRequestBuilder] Initial URL: ${url}`);
    
    const queryParams = parameters.filter(p => p.location === 'query');
    if (queryParams.length > 0) {
      const queryString = queryParams
        .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.value))}`)
        .join('&');
      url += `?${queryString}`;
      console.log(`[HttpRequestBuilder] URL with query params: ${url}`);
    }

    // Подготавливаем headers
    const headers: any = {};
    parameters.filter(p => p.location === 'header').forEach(p => {
      headers[p.name] = String(p.value);
    });

    // Подготавливаем path параметры
    let finalUrl = url;
    const pathParams = parameters.filter(p => p.location === 'path');
    console.log(`[HttpRequestBuilder] Path parameters:`, pathParams);
    
    pathParams.forEach(p => {
      const placeholder = `{${p.name}}`;
      const value = String(p.value);
      console.log(`[HttpRequestBuilder] Replacing ${placeholder} with ${value}`);
      finalUrl = finalUrl.replace(placeholder, value);
    });

    console.log(`[HttpRequestBuilder] Final URL: ${finalUrl}`);
    console.log(`[HttpRequestBuilder] Headers:`, headers);

    return {
      url: finalUrl,
      headers
    };
  }
}
