import { Injectable, Logger } from '@nestjs/common';
import { ClassifierService } from '../classifier/classifier.service';
import { ApiPlannerService } from './api-planner.service';
import { HttpExecutorService } from './http-executor.service';
import { ResponseFormatterService } from './response-formatter.service';
import { QueryResponse } from './dto/query-response.dto';
import { ClassificationResult, ProcessedResult, HttpToolResult } from './interfaces/classification.interface';

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly apiPlannerService: ApiPlannerService,
    private readonly httpExecutorService: HttpExecutorService,
    private readonly responseFormatter: ResponseFormatterService,
  ) {}

  async processQuery(message: string): Promise<QueryResponse> {
    this.logger.log(`Processing query: ${message}`);

    const classification = await this.classifyRequest(message);
    const result = await this.processClassification(classification, message);
    return this.buildResponse(result);
  }

  private async classifyRequest(message: string): Promise<ClassificationResult> {
    this.logger.log('Classifying request directly...');
    return await this.classifierService.classifyRequest(message);
  }

  private async processClassification(classification: ClassificationResult, message: string): Promise<ProcessedResult> {
    const hasHttpTool = classification.tasks.some(task => task.command === 'HTTP_TOOL');
    
    let apiPlan: any = null;
    let executionResults: any = null;
    
    if (hasHttpTool) {
      const httpResult = await this.processHttpToolTasks(classification.tasks, message);
      apiPlan = httpResult.apiPlan;
      executionResults = httpResult.executionResults;
    }
    
    return {
      tasks: classification.tasks,
      apiPlan,
      executionResults,
    };
  }

  private async processHttpToolTasks(tasks: any[], message: string): Promise<HttpToolResult> {
    try {
      this.logger.log('Generating API plan for HTTP_TOOL commands');
      const httpToolTasks = tasks.filter(task => task.command === 'HTTP_TOOL');
      const planPrompt = this.buildPlanPrompt(httpToolTasks, message);
      
      this.logger.log(`Planning for ${httpToolTasks.length} HTTP_TOOL tasks`);
      const apiPlan = await this.apiPlannerService.planApiCalls(planPrompt);
      
      let executionResults: any = null;
      if (apiPlan && apiPlan.plan && apiPlan.plan.length > 0) {
        this.logger.log('Executing API plan');
        executionResults = await this.httpExecutorService.executePlan(apiPlan.plan, planPrompt);
      }
      
      return { apiPlan, executionResults };
    } catch (error) {
      this.logger.warn('Failed to generate or execute API plan:', error);
      return { apiPlan: null, executionResults: null };
    }
  }

  private buildPlanPrompt(httpToolTasks: any[], message: string): string {
    return httpToolTasks.length > 0 
      ? httpToolTasks.map(task => task.prompt).join('\n\n')
      : message;
  }

  private buildResponse(result: ProcessedResult): QueryResponse {
    const response: QueryResponse = {
      tasks: result.tasks
    };
    
    if (result.apiPlan) {
      response.apiPlan = result.apiPlan;
    }
    
    if (result.executionResults) {
      response.executionResults = result.executionResults;
      response.finalResponse = this.responseFormatter.formatFinalResponse(
        result.executionResults, 
        result.tasks[0]?.prompt || ''
      );
    }
    
    return response;
  }
}
