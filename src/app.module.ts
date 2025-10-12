import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { VaultModule } from './vault/vault.module';
import { OpenAIModule } from './openai/openai.module';
import { AgentModule } from './agent/agent.module';
import { ClassifierModule } from './classifier/classifier.module';

@Module({
  imports: [
    VaultModule,
    ConfigModule,
    DatabaseModule,
    OpenAIModule,
    ClassifierModule,
    AgentModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
