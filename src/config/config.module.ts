import { Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { VaultModule } from '../vault/vault.module';
import { VaultService } from '../vault/vault.service';

@Module({
  imports: [VaultModule],
  providers: [
    {
      provide: ConfigService,
      useFactory: async (vaultService: VaultService) => {
        const config = new ConfigService(vaultService);
        await config.loadSecretsFromVault();
        return config;
      },
      inject: [VaultService],
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
