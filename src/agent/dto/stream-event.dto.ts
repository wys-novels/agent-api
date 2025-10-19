export interface StreamEvent {
  type: 'classification' | 'apiPlan' | 'executionResults' | 'finalResponse' | 'error';
  data: any;
  timestamp: number;
}

export interface ClassificationStreamData {
  status: 'started' | 'completed';
  tasks?: Array<{ command: string; prompt: string }>;
}

export interface ApiPlanStreamData {
  status: 'started' | 'completed';
  plan?: any;
}

export interface ExecutionResultsStreamData {
  status: 'started' | 'completed';
  results?: any[];
}

export interface FinalResponseStreamData {
  status: 'started' | 'completed';
  response?: string;
}

export interface ErrorStreamData {
  error: string;
  step?: string;
}
