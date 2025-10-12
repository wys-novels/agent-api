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
}
