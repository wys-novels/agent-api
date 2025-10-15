import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiRegistry } from './api-registry.entity';
import { FeatureRegistry } from './feature-registry.entity';
import { EndpointRegistry } from './endpoint-registry.entity';
import { CreateApiRegistryDto } from './dto/create-api-registry.dto';
import { UpdateApiRegistryDto } from './dto/update-api-registry.dto';
import { SwaggerService } from './swagger.service';

@Injectable()
export class ApiRegistryService {
  private readonly logger = new Logger(ApiRegistryService.name);

  constructor(
    @InjectRepository(ApiRegistry)
    private readonly apiRegistryRepository: Repository<ApiRegistry>,
    @InjectRepository(FeatureRegistry)
    private readonly featureRegistryRepository: Repository<FeatureRegistry>,
    @InjectRepository(EndpointRegistry)
    private readonly endpointRegistryRepository: Repository<EndpointRegistry>,
    private readonly swaggerService: SwaggerService,
    private readonly dataSource: DataSource,
  ) {}

  async create(createApiRegistryDto: CreateApiRegistryDto): Promise<ApiRegistry> {
    this.logger.log(`Creating API registry for Swagger URL: ${createApiRegistryDto.swaggerUrl}`);
    
    // Парсим Swagger JSON
    const { apiInfo, features, endpoints } = await this.swaggerService.parseSwaggerJson(createApiRegistryDto.swaggerUrl);
    
    // Используем транзакцию для создания всей иерархии
    return await this.dataSource.transaction(async manager => {
      // Создаем ApiRegistry
      const apiRegistry = manager.create(ApiRegistry, {
        swaggerUrl: createApiRegistryDto.swaggerUrl,
        baseUrl: apiInfo.baseUrl,
        name: apiInfo.name,
        description: apiInfo.description,
      });
      
      const savedApiRegistry = await manager.save(apiRegistry);
      
      // Создаем FeatureRegistry записи
      const featureMap = new Map<string, FeatureRegistry>();
      
      for (const feature of features) {
        const featureRegistry = manager.create(FeatureRegistry, {
          name: feature.name,
          description: feature.description,
          apiRegistry: savedApiRegistry,
        });
        
        const savedFeature = await manager.save(featureRegistry);
        featureMap.set(feature.name, savedFeature);
      }
      
      // Создаем EndpointRegistry записи
      for (const endpoint of endpoints) {
        const feature = featureMap.get(endpoint.featureName);
        if (feature) {
          const endpointRegistry = manager.create(EndpointRegistry, {
            path: endpoint.path,
            method: endpoint.method,
            summary: endpoint.summary,
            description: endpoint.description,
            operationId: endpoint.operationId,
            parameters: endpoint.parameters,
            featureRegistry: feature,
          });
          
          await manager.save(endpointRegistry);
        }
      }
      
      this.logger.log(`Created API registry with ${features.length} features and ${endpoints.length} endpoints`);
      
      return savedApiRegistry;
    });
  }

  async findAll(): Promise<ApiRegistry[]> {
    this.logger.log('Finding all API registries');
    return await this.apiRegistryRepository.find();
  }

  async findOne(id: string): Promise<ApiRegistry> {
    this.logger.log(`Finding API registry with ID: ${id}`);
    
    const apiRegistry = await this.apiRegistryRepository.findOne({ where: { id } });
    
    if (!apiRegistry) {
      throw new NotFoundException(`API registry with ID ${id} not found`);
    }
    
    return apiRegistry;
  }

  async update(id: string, updateApiRegistryDto: UpdateApiRegistryDto): Promise<ApiRegistry> {
    this.logger.log(`Updating API registry with ID: ${id}`);
    
    const apiRegistry = await this.findOne(id);
    
    if (updateApiRegistryDto.swaggerUrl) {
      // Если изменился Swagger URL, перепарсим всю структуру
      const { apiInfo, features, endpoints } = await this.swaggerService.parseSwaggerJson(updateApiRegistryDto.swaggerUrl);
      
      return await this.dataSource.transaction(async manager => {
        // Обновляем ApiRegistry
        apiRegistry.swaggerUrl = updateApiRegistryDto.swaggerUrl!;
        apiRegistry.baseUrl = apiInfo.baseUrl;
        apiRegistry.name = apiInfo.name;
        apiRegistry.description = apiInfo.description || '';
        
        const savedApiRegistry = await manager.save(apiRegistry);
        
        // Удаляем старые Features и Endpoints (каскадное удаление)
        await manager.delete(FeatureRegistry, { apiRegistry: { id } });
        
        // Создаем новые FeatureRegistry записи
        const featureMap = new Map<string, FeatureRegistry>();
        
        for (const feature of features) {
          const featureRegistry = manager.create(FeatureRegistry, {
            name: feature.name,
            description: feature.description,
            apiRegistry: savedApiRegistry,
          });
          
          const savedFeature = await manager.save(featureRegistry);
          featureMap.set(feature.name, savedFeature);
        }
        
        // Создаем новые EndpointRegistry записи
        for (const endpoint of endpoints) {
          const feature = featureMap.get(endpoint.featureName);
          if (feature) {
            const endpointRegistry = manager.create(EndpointRegistry, {
              path: endpoint.path,
              method: endpoint.method,
              summary: endpoint.summary,
              description: endpoint.description,
              operationId: endpoint.operationId,
              parameters: endpoint.parameters,
              featureRegistry: feature,
            });
            
            await manager.save(endpointRegistry);
          }
        }
        
        return savedApiRegistry;
      });
    }
    
    return apiRegistry;
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing API registry with ID: ${id}`);
    
    const apiRegistry = await this.findOne(id);
    await this.apiRegistryRepository.remove(apiRegistry);
  }

  async findFeaturesByApiId(apiId: string): Promise<FeatureRegistry[]> {
    this.logger.log(`Finding features for API: ${apiId}`);
    return await this.featureRegistryRepository.find({
      where: { apiRegistry: { id: apiId } },
      relations: ['endpoints'],
    });
  }

  async findEndpointsByFeatureId(featureId: string): Promise<EndpointRegistry[]> {
    this.logger.log(`Finding endpoints for feature: ${featureId}`);
    return await this.endpointRegistryRepository.find({
      where: { featureRegistry: { id: featureId } },
    });
  }
}
