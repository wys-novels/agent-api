import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenAIModule } from '../openai/openai.module';
import { ClassifierModule } from '../classifier/classifier.module';
import { ApiRegistryModule } from '../api-registry/api-registry.module';
import { SwaggerService } from '../api-registry/swagger.service';
import { AgentController } from './agent.controller';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { ResponseFormatterService } from './response-formatter.service';
import { ApiPlannerService } from './api-planner.service';
import { HttpExecutorService } from './http-executor.service';
import { ReasoningService } from './reasoning.service';

@Module({
  imports: [HttpModule, OpenAIModule, ClassifierModule, ApiRegistryModule],
  controllers: [AgentController],
  providers: [
    AgentOrchestratorService,
    ResponseFormatterService,
    ApiPlannerService, 
    HttpExecutorService, 
    SwaggerService, 
    ReasoningService
  ],
})
export class AgentModule {}
