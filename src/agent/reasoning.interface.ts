export interface IntentAnalysis {
  originalRequest: string;
  interpretedIntent: string;
  confidence: number;
  assumptions: string[];
  missingData: string[];
  contextualNotes: string[];
}

export interface ReasoningResult {
  shouldProceed: boolean;
  enrichedRequest: string;
  analysis: IntentAnalysis;
  recommendations: string[];
}

export interface ContextualInfo {
  availableApis: string[];
  userHistory?: string[];
  currentContext?: string;
  systemConstraints?: string[];
}

export interface ReasoningPrompt {
  systemPrompt: string;
  userPrompt: string;
  context: ContextualInfo;
}
