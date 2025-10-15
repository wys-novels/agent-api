import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { ApiRegistryService } from '../api-registry/api-registry.service';
import { 
  ApiCallPlan, 
  ApiPlannerResponse, 
  ApiWithFeatures, 
  FeatureWithEndpoints, 
  EndpointWithParams,
  EndpointPlan,
  ParameterValue 
} from './api-planner.interface';

@Injectable()
export class ApiPlannerService {
  private readonly logger = new Logger(ApiPlannerService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly apiRegistryService: ApiRegistryService,
  ) {}

  async planApiCalls(prompt: string): Promise<ApiPlannerResponse> {
    this.logger.log(`Planning API calls for prompt: ${prompt}`);

    const parsingErrors: string[] = [];

    try {
      // Этап 1: Выбор релевантных API
      const relevantApis = await this.selectRelevantApis(prompt);
      this.logger.log(`Selected ${relevantApis.length} APIs`);

      // Этап 2: Выбор релевантных фичей
      const relevantFeatures = await this.selectRelevantFeatures(prompt, relevantApis);
      this.logger.log(`Selected ${relevantFeatures.length} features`);

      // Этап 3: Планирование последовательности эндпоинтов
      const endpointSequence = await this.planEndpointSequence(prompt, relevantFeatures, relevantApis);
      this.logger.log(`Planned ${endpointSequence.length} endpoint calls`);

      return { 
        plan: endpointSequence, 
        ...(parsingErrors.length > 0 && { parsingErrors })
      };
    } catch (error) {
      this.logger.error('Error planning API calls:', error);
      throw error;
    }
  }

  private async selectRelevantApis(userPrompt: string): Promise<ApiWithFeatures[]> {
    this.logger.log('Stage 1: Selecting relevant APIs');

    // Получаем все API с их фичами
    const allApis = await this.apiRegistryService.findAll();
    const apisWithFeatures: ApiWithFeatures[] = [];

    for (const api of allApis) {
      const features = await this.apiRegistryService.findFeaturesByApiId(api.id);
      const featuresWithEndpoints: FeatureWithEndpoints[] = [];

      for (const feature of features) {
        const endpoints = await this.apiRegistryService.findEndpointsByFeatureId(feature.id);
        const endpointsWithParams: EndpointWithParams[] = endpoints.map(endpoint => ({
          id: endpoint.id,
          path: endpoint.path,
          method: endpoint.method,
          summary: endpoint.summary,
          description: endpoint.description,
          operationId: endpoint.operationId,
          parameters: (endpoint as any).parameters || null,
        }));

        featuresWithEndpoints.push({
          id: feature.id,
          name: feature.name,
          description: feature.description,
          endpoints: endpointsWithParams,
        });
      }

      apisWithFeatures.push({
        id: api.id,
        name: api.name,
        description: api.description,
        baseUrl: api.baseUrl,
        features: featuresWithEndpoints,
      });
    }

    // Формируем промпт для ИИ
    const apiDescriptions = apisWithFeatures.map(api => 
      `ID: ${api.id}\nAPI: ${api.name}\nDescription: ${api.description}\nBase URL: ${api.baseUrl}\nFeatures: ${api.features.map(f => f.name).join(', ')}`
    ).join('\n\n');

    const aiPrompt = `Проанализируй запрос пользователя и выбери релевантные API (1-3 API).

Доступные API:
${apiDescriptions}

Запрос пользователя: "${userPrompt}"

Верни только ID выбранных API через запятую (используй точные ID из списка выше):`;

    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: aiPrompt }],
    });

    const selectedApiIds = response.content.split(',').map(id => id.trim());
    return apisWithFeatures.filter(api => selectedApiIds.includes(api.id));
  }

  private async selectRelevantFeatures(userPrompt: string, apis: ApiWithFeatures[]): Promise<FeatureWithEndpoints[]> {
    this.logger.log('Stage 2: Selecting relevant features');

    const allFeatures = apis.flatMap(api => 
      api.features.map(feature => ({
        ...feature,
        apiName: api.name,
        apiId: api.id,
      }))
    );

    const featureDescriptions = allFeatures.map(feature => 
      `ID: ${feature.id}\nFeature: ${feature.name}\nAPI: ${feature.apiName}\nDescription: ${feature.description}\nEndpoints: ${feature.endpoints.map(e => `${e.method} ${e.path}`).join(', ')}`
    ).join('\n\n');

    const aiPrompt = `Проанализируй запрос пользователя и выбери релевантные фичи.

Доступные фичи:
${featureDescriptions}

Запрос пользователя: "${userPrompt}"

Верни только ID выбранных фичей через запятую (используй точные ID из списка выше):`;

    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: aiPrompt }],
    });

    const selectedFeatureIds = response.content.split(',').map(id => id.trim());
    return allFeatures.filter(feature => selectedFeatureIds.includes(feature.id));
  }

  private async planEndpointSequence(userPrompt: string, features: FeatureWithEndpoints[], apis: ApiWithFeatures[]): Promise<EndpointPlan[]> {
    this.logger.log('Stage 3: Planning endpoint sequence');

    const allEndpoints = features.flatMap(feature => 
      feature.endpoints.map(endpoint => ({
        ...endpoint,
        featureName: feature.name,
        apiName: (feature as any).apiName,
      }))
    );

    const endpointDescriptions = allEndpoints.map((endpoint, index) => 
      `${index + 1}. ID: ${endpoint.id}\n   ${endpoint.method} ${endpoint.path}\n   Feature: ${endpoint.featureName}\n   API: ${endpoint.apiName}\n   Summary: ${endpoint.summary}\n   Description: ${endpoint.description}`
    ).join('\n\n');

    const aiPrompt = `Проанализируй запрос пользователя и создай последовательность вызовов эндпоинтов.

Доступные эндпоинты:
${endpointDescriptions}

Запрос пользователя: "${userPrompt}"

Верни последовательность в формате:
1. endpoint_id_1
2. endpoint_id_2
3. endpoint_id_3

Только номера и ID эндпоинтов, по одному на строку (используй точные ID из списка выше):`;

    const response = await this.openaiService.generateAnswer({
      messages: [{ role: 'user', content: aiPrompt }],
    });

    const endpointIds = response.content
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(id => id);

    const endpointSequence: EndpointPlan[] = [];
    for (let i = 0; i < endpointIds.length; i++) {
      const endpoint = allEndpoints.find(e => e.id === endpointIds[i]);
      if (endpoint) {
        // Находим baseUrl для этого endpoint
        const api = apis.find(a => 
          a.features.some(f => f.endpoints.some(e => e.id === endpoint.id))
        );
        const baseUrl = api ? api.baseUrl : 'https://api.example.com';

        this.logger.log(`Adding endpoint to plan: ${endpoint.path} ${endpoint.method}`);
        this.logger.log(`Endpoint parameters from DB: ${JSON.stringify(endpoint.parameters, null, 2)}`);
        
        endpointSequence.push({
          step: i + 1,
          endpointId: endpoint.id,
          apiName: endpoint.apiName,
          featureName: endpoint.featureName,
          endpoint: endpoint.path,
          method: endpoint.method,
          description: endpoint.description,
          baseUrl: baseUrl,
          parameters: endpoint.parameters,
        });
      }
    }

    return endpointSequence;
  }

}
