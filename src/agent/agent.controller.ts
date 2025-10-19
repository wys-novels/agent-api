import { Controller, Get, Query, Logger, UseFilters, Headers, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { QueryDto } from './dto/query.dto';
import { QueryResponse } from './dto/query-response.dto';
import { StreamEvent } from './dto/stream-event.dto';
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
  @Sse('query-stream')
  async query(
    @Query() queryDto: QueryDto,
    @Headers('accept') accept: string
  ): Promise<QueryResponse | Observable<StreamEvent>> {
    const isStreaming = accept?.includes('text/event-stream');
    
    this.logger.log(`Processing query: ${queryDto.message}, streaming: ${isStreaming}`);
    
    if (isStreaming) {
      return this.agentOrchestrator.processQueryStream(queryDto.message);
    }
    
    return await this.agentOrchestrator.processQuery(queryDto.message);
  }

}
