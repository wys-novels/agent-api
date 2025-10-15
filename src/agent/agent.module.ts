import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenAIModule } from '../openai/openai.module';
import { ClassifierModule } from '../classifier/classifier.module';
import { ApiRegistryModule } from '../api-registry/api-registry.module';
import { AgentController } from './agent.controller';
import { ApiPlannerService } from './api-planner.service';
import { HttpExecutorService } from './http-executor.service';

@Module({
  imports: [HttpModule, OpenAIModule, ClassifierModule, ApiRegistryModule],
  controllers: [AgentController],
  providers: [ApiPlannerService, HttpExecutorService],
})
export class AgentModule {}
