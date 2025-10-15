import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OpenAIService } from '../openai/openai.service';
import { ApiCallPlan, ExecutionResult, ParameterValue } from './api-planner.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HttpExecutorService {
  private readonly logger = new Logger(HttpExecutorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly openaiService: OpenAIService,
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
        results.push({
          step: step.step,
          endpoint: step.endpoint,
          method: step.method,
          requestParameters: [],
          requestBody: null,
          response: null,
          responseStatus: 0,
          success: false,
          error: `Ошибка выполнения: ${error.message}`,
        });
        break;
      }
    }

    return results;
  }

  private async executeStep(
    step: ApiCallPlan, 
    previousResults: ExecutionResult[], 
    userPrompt: string
  ): Promise<ExecutionResult> {
    // Генерируем параметры для этого шага
    const { parameters, body } = await this.generateParametersForStep(step, previousResults, userPrompt);

    // Выполняем HTTP запрос
    const { response, status } = await this.makeHttpRequest(
      step.baseUrl,
      step.endpoint,
      step.method,
      parameters,
      body
    );

    return {
      step: step.step,
      endpoint: step.endpoint,
      method: step.method,
      requestParameters: parameters,
      requestBody: body,
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
  ): Promise<{ parameters: ParameterValue[]; body: any }> {
    
    // Получаем актуальную схему из Swagger
    const swaggerSchema = await this.getSwaggerSchemaForEndpoint(step);
    this.logger.log(`Generating parameters for step ${step.step}`);

    // Формируем описание предыдущих результатов
    const previousResultsText = previousResults.length > 0 
      ? previousResults.map(r => 
          `Шаг ${r.step}: ${r.method} ${r.endpoint} -> ${r.success ? 'Успех' : 'Ошибка'}\n` +
          `Ответ: ${JSON.stringify(r.response, null, 2)}`
        ).join('\n\n')
      : '[нет предыдущих результатов]';

    // Формируем детальное описание схемы body из Swagger
    const bodyDescription = swaggerSchema?.requestBody 
      ? this.formatSwaggerRequestBody(swaggerSchema.requestBody)
      : 'Нет body';

    const prompt = `Сгенерируй параметры и body для HTTP запроса.

Эндпоинт: ${step.method} ${step.endpoint}
Описание: ${step.description}

Схема параметров:
Query: ${JSON.stringify(swaggerSchema?.parameters?.filter(p => p.in === 'query') || [], null, 2)}
Path: ${JSON.stringify(swaggerSchema?.parameters?.filter(p => p.in === 'path') || [], null, 2)}
Header: ${JSON.stringify(swaggerSchema?.parameters?.filter(p => p.in === 'header') || [], null, 2)}

Схема Body (JSON):
${bodyDescription}

Запрос пользователя: "${userPrompt}"

Предыдущие результаты:
${previousResultsText}

ВАЖНО: 
- Если в схеме body есть обязательные поля (required), ты ДОЛЖЕН их заполнить
- Извлекай значения из запроса пользователя или используй разумные значения по умолчанию
- Для timezone используй значения типа "Europe/Moscow", "UTC", "America/New_York"

Верни ТОЛЬКО валидный JSON без markdown блоков:
{
  "parameters": [
    {"name": "param", "value": "value", "location": "query"}
  ],
  "body": {
    "key": "value"
  }
}`;

    this.logger.log(`Prompt for step ${step.step}: ${prompt.substring(0, 500)}...`);

    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: prompt }],
    });

    this.logger.log(`AI Response for step ${step.step}: ${response.content}`);

    try {
      // Извлекаем JSON из markdown блока если есть
      let jsonContent = response.content;
      
      // Убираем markdown блоки если есть
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      
      const parsed = JSON.parse(jsonContent);
      this.logger.log(`Parsed parameters for step ${step.step}: ${JSON.stringify(parsed)}`);
      
      return {
        parameters: parsed.parameters || [],
        body: parsed.body || null,
      };
    } catch (error) {
      this.logger.error(`Failed to parse parameters for step ${step.step}: ${error.message}`);
      this.logger.error(`Response: ${response.content}`);
      
      // Возвращаем пустые параметры в случае ошибки
      return {
        parameters: [],
        body: null,
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
      // Подготавливаем URL с query параметрами
      let url = `${baseUrl}${endpoint}`;
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

      // Выполняем запрос
      const response = await firstValueFrom(
        this.httpService.request({
          method: method.toLowerCase() as any,
          url: finalUrl,
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

  private formatSchemaForPrompt(schema: any): string {
    if (!schema) return 'Нет схемы';
    
    // Если это разрешенная схема из $ref
    if (schema.type === 'object' && schema.properties) {
      const required = schema.required || [];
      let description = 'Объект со следующими полями:\n';
      
      for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(fieldName);
        const fieldInfo = fieldSchema as any;
        
        description += `- ${fieldName}${isRequired ? ' (ОБЯЗАТЕЛЬНО)' : ' (опционально)'}: ${fieldInfo.type || 'unknown'}`;
        
        if (fieldInfo.description) {
          description += ` - ${fieldInfo.description}`;
        }
        
        if (fieldInfo.example) {
          description += ` (пример: ${fieldInfo.example})`;
        }
        
        description += '\n';
      }
      
      return description;
    }
    
    // Если это $ref, который не был разрешен
    if (schema.$ref) {
      return `Ссылка на схему: ${schema.$ref}`;
    }
    
    return JSON.stringify(schema, null, 2);
  }

  private async getSwaggerSchemaForEndpoint(step: ApiCallPlan): Promise<any> {
    // Получаем swaggerUrl из API Registry
    const swaggerUrl = await this.getSwaggerUrlForStep(step);
    
    if (!swaggerUrl) {
      this.logger.warn(`No swagger URL found for step ${step.step}`);
      return null;
    }

    try {
      // Загружаем Swagger JSON
      const response = await this.httpService.axiosRef.get(swaggerUrl);
      const swaggerJson = response.data;
      
      // Ищем нужный endpoint
      const paths = swaggerJson.paths || {};
      const endpointPath = step.endpoint;
      const method = step.method.toLowerCase();
      
      if (paths[endpointPath] && paths[endpointPath][method]) {
        const operation = paths[endpointPath][method];
        
        // Извлекаем схему параметров
        return {
          parameters: operation.parameters || [],
          requestBody: operation.requestBody,
          summary: operation.summary,
          description: operation.description
        };
      }
      
      this.logger.warn(`Endpoint ${method.toUpperCase()} ${endpointPath} not found in Swagger`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to load Swagger schema: ${error.message}`);
      return null;
    }
  }

  private async getSwaggerUrlForStep(step: ApiCallPlan): Promise<string | null> {
    // Здесь нужно получить swaggerUrl из API Registry
    // Пока возвращаем заглушку
    return 'http://185.104.112.84:3000/api-docs';
  }

  private formatSwaggerRequestBody(requestBody: any): string {
    if (!requestBody || !requestBody.content) {
      return 'Нет body';
    }

    const jsonContent = requestBody.content['application/json'];
    if (!jsonContent || !jsonContent.schema) {
      return 'Нет body';
    }

    const schema = jsonContent.schema;
    
    // Если есть $ref, пытаемся его разрешить
    if (schema.$ref) {
      return `Ссылка на схему: ${schema.$ref}`;
    }

    // Если это объект с полями
    if (schema.type === 'object' && schema.properties) {
      const required = schema.required || [];
      let description = 'Объект со следующими полями:\n';
      
      for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(fieldName);
        const fieldInfo = fieldSchema as any;
        
        description += `- ${fieldName}${isRequired ? ' (ОБЯЗАТЕЛЬНО)' : ' (опционально)'}: ${fieldInfo.type || 'unknown'}`;
        
        if (fieldInfo.description) {
          description += ` - ${fieldInfo.description}`;
        }
        
        if (fieldInfo.example) {
          description += ` (пример: ${fieldInfo.example})`;
        }
        
        description += '\n';
      }
      
      return description;
    }
    
    return JSON.stringify(schema, null, 2);
  }

}
