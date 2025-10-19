import { Injectable, Logger } from '@nestjs/common';
import { IConfig } from './config.interface';
import { VaultService } from '../vault/vault.service';
import { DEFAULT_CONFIG, ERROR_MESSAGES } from '../agent/constants/http.constants';

@Injectable()
export class ConfigService implements IConfig {
  private readonly logger = new Logger(ConfigService.name);
  
  public readonly port = parseInt(process.env.PORT || '3000');
  public readonly environment = process.env.NODE_ENV || 'development';
  
  public readonly vault = {
    address: process.env.VAULT_ADDR || '',
    token: process.env.VAULT_TOKEN || '',
  };
  
  public database = {
    host: '',
    port: 0,
    username: '',
    password: '',
    database: '',
  };

  public api = {
    proxyApiKey: '',
  };

  constructor(private readonly vaultService: VaultService) {}

  async loadSecretsFromVault(): Promise<void> {
    if (!this.vault.address || !this.vault.token) {
      this.logger.warn('Vault credentials not configured, using environment variables');
      return;
    }

    this.logger.log(`Loading secrets from Vault at ${this.vault.address}`);

    try {
      const isHealthy = await this.vaultService.isHealthy();
      if (!isHealthy) {
        this.logger.warn('Vault is not healthy, using environment variables');
        return;
      }

      this.logger.log('Vault is healthy, loading secrets');
      
      await this.loadDatabaseSecrets();
      await this.loadApiSecrets();
      
      this.logger.log('Configuration loaded successfully from Vault');
    } catch (error) {
      this.logger.error('Failed to load secrets from Vault:', error.message);
      this.logger.warn('Falling back to environment variables');
    }
  }

  private async loadDatabaseSecrets(): Promise<void> {
    try {
      this.logger.log('Loading database secrets from postgres and life');
      const postgresSecrets = await this.vaultService.readSecret('postgres');
      const lifeSecrets = await this.vaultService.readSecret('life');
      
      if (postgresSecrets && lifeSecrets) {
        this.database = {
          host: postgresSecrets.host,
          port: parseInt(postgresSecrets.port),
          username: lifeSecrets.username,
          password: lifeSecrets.password,
          database: lifeSecrets.database,
        };
        this.logger.log(`Database secrets loaded from Vault (host: ${this.database.host}:${this.database.port}, db: ${this.database.database})`);
      } else {
        this.logger.error('No database secrets found in Vault');
        throw new Error('Database secrets not found in Vault');
      }
    } catch (error) {
      this.logger.error('Failed to load database secrets:', error.message);
    }
  }

  private async loadApiSecrets(): Promise<void> {
    try {
      this.logger.log('Loading API secrets from api');
      const apiSecrets = await this.vaultService.readSecret('api');
      if (apiSecrets) {
        this.api = {
          proxyApiKey: apiSecrets.proxy_api_key,
        };
        const hasApiKey = this.api.proxyApiKey ? 'configured' : 'empty';
        this.logger.log(`API secrets loaded from Vault (proxy_api_key: ${hasApiKey})`);
      } else {
        this.logger.error('No API secrets found in Vault');
        throw new Error('API secrets not found in Vault');
      }
    } catch (error) {
      this.logger.error('Failed to load API secrets:', error.message);
    }
  }

  async getOpenAIApiKey(): Promise<string> {
    try {
      const globalSecrets = await this.vaultService.readSecret('global');
      return globalSecrets?.openai_api_key || '';
    } catch (error) {
      this.logger.error('Failed to get OpenAI API key from Vault:', error.message);
      return '';
    }
  }

  async getOpenAIConfig(): Promise<{
    model: string;
    temperature: number;
    maxTokens: number;
  }> {
    try {
      const lifeSecrets = await this.vaultService.readSecret('life');
      
      return {
        model: lifeSecrets?.openai_model || DEFAULT_CONFIG.MODEL,
        temperature: parseFloat(lifeSecrets?.openai_temperature || DEFAULT_CONFIG.TEMPERATURE.toString()),
        maxTokens: parseInt(lifeSecrets?.openai_max_tokens || DEFAULT_CONFIG.MAX_TOKENS.toString()),
      };
    } catch (error) {
      this.logger.error('Failed to get OpenAI config from Vault:', error.message);
      // Возвращаем значения по умолчанию
      return {
        model: DEFAULT_CONFIG.MODEL,
        temperature: DEFAULT_CONFIG.TEMPERATURE,
        maxTokens: DEFAULT_CONFIG.MAX_TOKENS,
      };
    }
  }
}
