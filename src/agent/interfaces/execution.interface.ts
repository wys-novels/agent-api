export interface HttpResult {
  response: any;
  status: number;
}

export interface ParameterContext {
  step: any;
  swaggerSchema: any;
  previousResults: any[];
  userPrompt: string;
}

export interface SwaggerSchema {
  parameters?: Array<{
    in: 'query' | 'path' | 'header';
    name: string;
    required?: boolean;
    type?: string;
  }>;
  requestBody?: any;
}
