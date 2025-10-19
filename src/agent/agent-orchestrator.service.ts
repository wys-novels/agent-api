import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { ClassifierService } from '../classifier/classifier.service';
import { ApiPlannerService } from './api-planner.service';
import { HttpExecutorService } from './http-executor.service';
import { ResponseFormatterService } from './response-formatter.service';
import { QueryResponse } from './dto/query-response.dto';
import { StreamEvent } from './dto/stream-event.dto';
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
    return await this.buildResponse(result);
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

  private async buildResponse(result: ProcessedResult): Promise<QueryResponse> {
    const response: QueryResponse = {
      tasks: result.tasks
    };
    
    if (result.apiPlan) {
      response.apiPlan = result.apiPlan;
    }
    
    if (result.executionResults) {
      response.executionResults = result.executionResults;
      response.finalResponse = await this.responseFormatter.formatFinalResponse(
        result.executionResults, 
        result.tasks[0]?.prompt || ''
      );
    }
    
    return response;
  }

  processQueryStream(message: string): Observable<StreamEvent> {
    this.logger.log(`Starting streaming process for query: ${message}`);
    
    return new Observable(subscriber => {
      this.processQueryWithStreaming(message, subscriber);
    });
  }

  private async processQueryWithStreaming(message: string, subscriber: Subscriber<StreamEvent>) {
    try {
      // Этап 1: Классификация
      subscriber.next({
        type: 'classification',
        data: { status: 'started' },
        timestamp: Date.now()
      });
      
      this.logger.log('Classifying request...');
      const classification = await this.classifyRequest(message);
      
      subscriber.next({
        type: 'classification',
        data: { 
          status: 'completed',
          tasks: classification.tasks 
        },
        timestamp: Date.now()
      });

      // Этап 2: Обработка классификации
      const hasHttpTool = classification.tasks.some(task => task.command === 'HTTP_TOOL');
      
      let apiPlan: any = null;
      let executionResults: any = null;
      
      if (hasHttpTool) {
        // Этап 2a: API Plan
        subscriber.next({
          type: 'apiPlan',
          data: { status: 'started' },
          timestamp: Date.now()
        });
        
        const httpResult = await this.processHttpToolTasks(classification.tasks, message);
        apiPlan = httpResult.apiPlan;
        executionResults = httpResult.executionResults;
        
        subscriber.next({
          type: 'apiPlan',
          data: { 
            status: 'completed',
            plan: apiPlan 
          },
          timestamp: Date.now()
        });

        // Этап 2b: Execution Results
        if (executionResults) {
          subscriber.next({
            type: 'executionResults',
            data: { 
              status: 'completed',
              results: executionResults 
            },
            timestamp: Date.now()
          });
        }
      }
      
      // Этап 3: Final Response
      subscriber.next({
        type: 'finalResponse',
        data: { status: 'started' },
        timestamp: Date.now()
      });
      
      const result: ProcessedResult = {
        tasks: classification.tasks,
        apiPlan,
        executionResults,
      };
      
      const finalResponse = await this.buildResponse(result);
      
      subscriber.next({
        type: 'finalResponse',
        data: { 
          status: 'completed',
          response: finalResponse.finalResponse 
        },
        timestamp: Date.now()
      });
      
      subscriber.complete();
      
    } catch (error) {
      this.logger.error('Error in streaming process:', error);
      subscriber.error({
        type: 'error',
        data: { 
          error: error.message,
          step: 'processing' 
        },
        timestamp: Date.now()
      });
    }
  }
}
