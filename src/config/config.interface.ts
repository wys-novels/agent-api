export interface IConfig {
  port: number;
  environment: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  vault: {
    address: string;
    token: string;
  };
  api: {
    proxyApiKey: string;
  };
  // Методы для динамического получения параметров OpenAI
  getOpenAIApiKey(): Promise<string>;
  getOpenAIConfig(): Promise<{
    model: string;
    temperature: number;
    maxTokens: number;
  }>;
}
