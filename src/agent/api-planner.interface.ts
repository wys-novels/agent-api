export interface ApiCallPlan {
  step: number;
  endpointId: string;
  apiName: string;
  featureName: string;
  endpoint: string;
  method: string;
  description: string;
  baseUrl: string; // baseUrl API
  parameters: any; // полная схема параметров из Swagger
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
}

export interface ApiWithFeatures {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
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
  parameters: any;
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
  parameters: any;
}
