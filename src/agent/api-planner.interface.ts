export interface ApiCallPlan {
  step: number;
  apiName: string;
  featureName: string;
  endpoint: string;
  method: string;
  parameters?: ParameterValue[];
  body?: any;
  description: string;
}

export interface ParameterValue {
  name: string;
  value: string | number | boolean;
  location: 'query' | 'path' | 'header';
}

export interface ApiPlannerResponse {
  plan: ApiCallPlan[];
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
  endpointId: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  parameters: any;
  step: number;
}
