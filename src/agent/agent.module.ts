import { Module } from '@nestjs/common';
import { OpenAIModule } from '../openai/openai.module';
import { AgentController } from './agent.controller';

@Module({
  imports: [OpenAIModule],
  controllers: [AgentController],
})
export class AgentModule {}
