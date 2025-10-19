export interface ClassificationResult {
  tasks: CommandTask[];
}

export interface CommandTask {
  command: string;
  prompt: string;
}

export interface ProcessedResult {
  tasks: CommandTask[];
  apiPlan?: any;
  executionResults?: any;
}

export interface HttpToolResult {
  apiPlan: any;
  executionResults: any;
}
