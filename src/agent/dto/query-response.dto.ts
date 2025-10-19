export interface QueryResponse {
  tasks: Array<{ command: string; prompt: string }>;
  apiPlan?: any;
  executionResults?: any;
  finalResponse?: string;
}
