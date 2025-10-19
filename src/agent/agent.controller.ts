import { Controller, Get, Query, Logger, UseFilters } from '@nestjs/common';
import { QueryDto } from './dto/query.dto';
import { QueryResponse } from './dto/query-response.dto';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { AgentOrchestratorService } from './agent-orchestrator.service';

@Controller('agent')
@UseFilters(GlobalExceptionFilter)
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentOrchestrator: AgentOrchestratorService,
  ) {}

  @Get('query')
  async query(@Query() queryDto: QueryDto): Promise<QueryResponse> {
    return await this.agentOrchestrator.processQuery(queryDto.message);
  }

}
