export const HTTP_STATUS = {
  SUCCESS_MIN: 200,
  SUCCESS_MAX: 299,
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599,
} as const;

export const DEFAULT_CONFIG = {
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.7,
  MODEL: 'gpt-4o',
  MAX_MESSAGE_LENGTH: 1000,
} as const;

export const ERROR_MESSAGES = {
  MESSAGE_REQUIRED: 'Message parameter is required',
  OPENAI_API_KEY_NOT_CONFIGURED: 'OpenAI API key not configured',
  NO_CONTENT_RECEIVED: 'No content received from OpenAI',
  VAULT_NOT_HEALTHY: 'Vault is not healthy',
  DATABASE_SECRETS_NOT_FOUND: 'Database secrets not found in Vault',
  API_SECRETS_NOT_FOUND: 'API secrets not found in Vault',
} as const;
