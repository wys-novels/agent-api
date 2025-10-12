import { Module } from '@nestjs/common';
import { OpenAIModule } from '../openai/openai.module';
import { ClassifierModule } from '../classifier/classifier.module';
import { AgentController } from './agent.controller';

@Module({
  imports: [OpenAIModule, ClassifierModule],
  controllers: [AgentController],
})
export class AgentModule {}
