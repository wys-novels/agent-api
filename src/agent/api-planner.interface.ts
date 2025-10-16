export interface ApiCallPlan {
  step: number;
  endpointId: string;
  apiName: string;
  featureName: string;
  endpoint: string;
  method: string;
  description: string;
  baseUrl: string; // baseUrl API
  swaggerUrl: string; // URL для загрузки Swagger схемы
}

export interface ParameterValue {
  name: string;
  value: string | number | boolean;
  location: 'query' | 'path' | 'header';
}

export interface ApiPlannerResponse {
  plan: ApiCallPlan[];
  parsingErrors?: string[];
}

export interface ExecutionResult {
  step: number;
  endpoint: string;
  method: string;
  requestParameters: ParameterValue[];
  requestBody: any;
  response: any;
  responseStatus: number;
  success: boolean;
  error?: string;
  errorType?: ExecutionErrorType;
  errorDetails?: any;
}

export interface ApiWithFeatures {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  swaggerUrl: string;
  features: FeatureWithEndpoints[];
}

export interface FeatureWithEndpoints {
  id: string;
  name: string;
  description: string;
  endpoints: EndpointWithParams[];
  apiName?: string;
  apiId?: string;
}

export interface EndpointWithParams {
  id: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  operationId: string;
}

export interface EndpointPlan {
  step: number;
  endpointId: string;
  apiName: string;
  featureName: string;
  endpoint: string;
  method: string;
  description: string;
  baseUrl: string;
  swaggerUrl: string;
}

export enum ExecutionErrorType {
  SWAGGER_ERROR = 'SWAGGER_ERROR',
  PARAMETER_GENERATION_ERROR = 'PARAMETER_GENERATION_ERROR',
  HTTP_REQUEST_ERROR = 'HTTP_REQUEST_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ParameterValidationStatus {
  SUCCESS = 'SUCCESS',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  ERROR = 'ERROR'
}

export interface StepContext {
  step: number;
  method: string;
  endpoint: string;
  success: boolean;
  response?: any;
  error?: string;
}

export interface StandardizedError {
  type: ExecutionErrorType;
  message: string;
  details?: any;
  step?: number;
}

export interface ParameterGenerationResult {
  status: ParameterValidationStatus;
  parameters: ParameterValue[];
  body: any;
  message?: string;
}