import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiRegistry } from './api-registry.entity';
import { CreateApiRegistryDto } from './dto/create-api-registry.dto';
import { UpdateApiRegistryDto } from './dto/update-api-registry.dto';

@Injectable()
export class ApiRegistryService {
  private readonly logger = new Logger(ApiRegistryService.name);

  constructor(
    @InjectRepository(ApiRegistry)
    private readonly apiRegistryRepository: Repository<ApiRegistry>,
  ) {}

  async create(createApiRegistryDto: CreateApiRegistryDto): Promise<ApiRegistry> {
    this.logger.log(`Creating API registry for URL: ${createApiRegistryDto.url}`);
    
    const name = this.generateNameFromUrl(createApiRegistryDto.url);
    
    const apiRegistry = this.apiRegistryRepository.create({
      url: createApiRegistryDto.url,
      name,
    });

    return await this.apiRegistryRepository.save(apiRegistry);
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
    
    if (updateApiRegistryDto.url) {
      apiRegistry.url = updateApiRegistryDto.url;
      apiRegistry.name = this.generateNameFromUrl(updateApiRegistryDto.url);
    }
    
    return await this.apiRegistryRepository.save(apiRegistry);
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing API registry with ID: ${id}`);
    
    const apiRegistry = await this.findOne(id);
    await this.apiRegistryRepository.remove(apiRegistry);
  }

  private generateNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      this.logger.warn(`Failed to parse URL: ${url}, using as name`);
      return url;
    }
  }
}
