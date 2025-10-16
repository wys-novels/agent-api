import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface SwaggerApiInfo {
  name: string;
  description?: string;
  baseUrl: string;
}

export interface SwaggerFeature {
  name: string;
  description?: string;
}

export interface SwaggerEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  operationId?: string;
  featureName: string;
  parameters?: any;
}

@Injectable()
export class SwaggerService {
  private readonly logger = new Logger(SwaggerService.name);
  private readonly swaggerCache = new Map<string, any>();

  constructor(private readonly httpService: HttpService) {}

  async validateSwaggerUrl(url: string): Promise<boolean> {
    try {
      this.logger.log(`Validating Swagger URL: ${url}`);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
          },
        })
      );

      if (response.status !== 200) {
        return false;
      }

      // Проверяем что это валидный JSON
      const json = response.data;
      if (!json || typeof json !== 'object') {
        return false;
      }

      // Проверяем что это OpenAPI документ
      if (!json.openapi && !json.swagger) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to validate Swagger URL: ${url}`, error);
      return false;
    }
  }

  async fetchSwaggerJson(url: string): Promise<any> {
    // Проверяем кэш
    if (this.swaggerCache.has(url)) {
      this.logger.log(`Using cached Swagger JSON for: ${url}`);
      return this.swaggerCache.get(url);
    }

    this.logger.log(`Fetching Swagger JSON from: ${url}`);
    
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
          },
        })
      );

      // Кэшируем результат
      this.swaggerCache.set(url, response.data);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch Swagger JSON from: ${url}`, error);
      throw new BadRequestException(`Failed to fetch Swagger documentation from: ${url}`);
    }
  }

  extractBaseUrl(swaggerUrl: string): string {
    try {
      const url = new URL(swaggerUrl);
      return `${url.protocol}//${url.host}`;
    } catch (error) {
      this.logger.warn(`Failed to extract base URL from: ${swaggerUrl}`);
      return swaggerUrl;
    }
  }

  extractApiInfo(json: any): SwaggerApiInfo {
    const info = json.info || {};
    
    return {
      name: info.title || 'Unknown API',
      description: info.description || null,
      baseUrl: '', // Будет заполнен отдельно
    };
  }

  extractFeatures(json: any): SwaggerFeature[] {
    const tags = json.tags || [];
    
    return tags.map((tag: any) => ({
      name: tag.name || 'Unknown Feature',
      description: tag.description || null,
    }));
  }

  extractEndpoints(json: any): SwaggerEndpoint[] {
    const paths = json.paths || {};
    const endpoints: SwaggerEndpoint[] = [];

    for (const [path, pathMethods] of Object.entries(paths)) {
      const methods = pathMethods as any;
      
      for (const [method, operation] of Object.entries(methods)) {
        if (typeof operation === 'object' && operation !== null) {
          const op = operation as any;
          
          endpoints.push({
            path,
            method: method.toUpperCase(),
            summary: op.summary || null,
            description: op.description || null,
            operationId: op.operationId || null,
            featureName: op.tags?.[0] || 'Unknown Feature',
            parameters: this.extractParameters(op, json),
          });
        }
      }
    }

    return endpoints;
  }

  private extractParameters(operation: any, swaggerJson?: any): any {
    const parameters = operation.parameters || [];
    const requestBody = operation.requestBody;
    
    const extractedParams: any = {
      query: [],
      path: [],
      header: [],
      body: null,
    };

    // Обрабатываем параметры
    for (const param of parameters) {
      const paramInfo = {
        name: param.name,
        in: param.in,
        required: param.required || false,
        type: param.schema?.type || 'string',
        description: param.description,
        schema: param.schema,
      };

      switch (param.in) {
        case 'query':
          extractedParams.query.push(paramInfo);
          break;
        case 'path':
          extractedParams.path.push(paramInfo);
          break;
        case 'header':
          extractedParams.header.push(paramInfo);
          break;
      }
    }

    // Обрабатываем request body
    if (requestBody) {
      extractedParams.body = {
        required: requestBody.required || false,
        description: requestBody.description,
        content: requestBody.content,
        schema: this.extractSchemaFromRequestBody(requestBody, swaggerJson),
      };
    }

    return extractedParams;
  }

  private extractSchemaFromRequestBody(requestBody: any, swaggerJson?: any): any {
    if (!requestBody.content || !requestBody.content['application/json']) {
      return null;
    }

    const content = requestBody.content['application/json'];
    if (!content.schema) {
      return null;
    }

    // Если есть $ref, нужно разрешить его
    if (content.schema.$ref) {
      return this.resolveSchemaRef(content.schema.$ref, swaggerJson);
    }

    return content.schema;
  }

  private resolveSchemaRef(ref: string, swaggerJson?: any): any {
    this.logger.log(`Resolving schema ref: ${ref}`);
    
    // Убираем #/ из начала ref
    const path = ref.replace('#/', '').split('/');
    
    if (!swaggerJson || path.length < 2) {
      this.logger.warn(`Cannot resolve ref ${ref}: no swaggerJson or invalid path`);
      return { $ref: ref };
    }
    
    // Парсим путь типа components/schemas/CreateSleepGroupDto
    if (path[0] === 'components' && path[1] === 'schemas' && path[2]) {
      const schemaName = path[2];
      const schema = swaggerJson.components?.schemas?.[schemaName];
      if (schema) {
        this.logger.log(`Resolved schema ${schemaName}: ${JSON.stringify(schema, null, 2)}`);
        return schema;
      } else {
        this.logger.warn(`Schema ${schemaName} not found in components.schemas`);
      }
    }
    
    this.logger.warn(`Could not resolve ref ${ref}`);
    return { $ref: ref };
  }

  async parseSwaggerJson(swaggerUrl: string): Promise<{
    apiInfo: SwaggerApiInfo;
    features: SwaggerFeature[];
    endpoints: SwaggerEndpoint[];
  }> {
    this.logger.log(`Parsing Swagger JSON from: ${swaggerUrl}`);

    // Валидируем URL
    const isValid = await this.validateSwaggerUrl(swaggerUrl);
    if (!isValid) {
      throw new BadRequestException(`Invalid Swagger URL: ${swaggerUrl}`);
    }

    // Получаем JSON
    const json = await this.fetchSwaggerJson(swaggerUrl);

    // Извлекаем данные
    const apiInfo = this.extractApiInfo(json);
    apiInfo.baseUrl = this.extractBaseUrl(swaggerUrl);

    const features = this.extractFeatures(json);
    const endpoints = this.extractEndpoints(json);

    this.logger.log(`Parsed ${features.length} features and ${endpoints.length} endpoints`);

    return {
      apiInfo,
      features,
      endpoints,
    };
  }

  // Метод для получения схемы конкретного эндпоинта
  async getEndpointSchema(swaggerUrl: string, endpointPath: string, method: string): Promise<any> {
    const swaggerJson = await this.fetchSwaggerJson(swaggerUrl);
    const paths = swaggerJson.paths || {};
    const methodLower = method.toLowerCase();
    
    if (paths[endpointPath] && paths[endpointPath][methodLower]) {
      const operation = paths[endpointPath][methodLower];
      return {
        parameters: operation.parameters || [],
        requestBody: operation.requestBody,
        summary: operation.summary,
        description: operation.description
      };
    }
    
    return null;
  }

  // Метод для форматирования схемы body для промпта
  formatRequestBodySchema(requestBody: any): string {
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
