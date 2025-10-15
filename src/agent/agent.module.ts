import { Module } from '@nestjs/common';
import { OpenAIModule } from '../openai/openai.module';
import { ClassifierModule } from '../classifier/classifier.module';
import { ApiRegistryModule } from '../api-registry/api-registry.module';
import { AgentController } from './agent.controller';
import { ApiPlannerService } from './api-planner.service';

@Module({
  imports: [OpenAIModule, ClassifierModule, ApiRegistryModule],
  controllers: [AgentController],
  providers: [ApiPlannerService],
})
export class AgentModule {}
