import { Injectable, Logger } from '@nestjs/common';
import vault from 'node-vault';

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private client: vault.client;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const vaultAddr = process.env.VAULT_ADDR;
    const vaultToken = process.env.VAULT_TOKEN;

    if (!vaultAddr || !vaultToken) {
      this.logger.warn('Vault credentials not found, skipping Vault initialization');
      return;
    }

    this.client = vault({
      apiVersion: 'v1',
      endpoint: vaultAddr,
      token: vaultToken,
    });

    this.logger.log('Vault client initialized');
  }

  async readSecret(path: string): Promise<any> {
    if (!this.client) {
      this.logger.warn(`Vault client not initialized, cannot read secret: ${path}`);
      return null;
    }

    try {
      const fullPath = `secret/data/${path}`;
      const result = await this.client.read(fullPath);
      this.logger.log(`Successfully read secret from: ${fullPath}`);
      
      return result.data.data;
    } catch (error) {
      this.logger.error(`Failed to read secret from ${path}:`, error.message);
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.health();
      return true;
    } catch (error) {
      this.logger.error('Vault health check failed:', error.message);
      return false;
    }
  }
}
