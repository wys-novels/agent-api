import { Controller, Get, Post, Body, Patch, Param, Delete, Logger } from '@nestjs/common';
import { ApiRegistryService } from './api-registry.service';
import { CreateApiRegistryDto } from './dto/create-api-registry.dto';
import { UpdateApiRegistryDto } from './dto/update-api-registry.dto';

@Controller('api-registry')
export class ApiRegistryController {
  private readonly logger = new Logger(ApiRegistryController.name);

  constructor(private readonly apiRegistryService: ApiRegistryService) {}

  @Post()
  create(@Body() createApiRegistryDto: CreateApiRegistryDto) {
    this.logger.log(`Creating API registry: ${createApiRegistryDto.swaggerUrl}`);
    return this.apiRegistryService.create(createApiRegistryDto);
  }

  @Get()
  findAll() {
    this.logger.log('Getting all API registries');
    return this.apiRegistryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting API registry: ${id}`);
    return this.apiRegistryService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateApiRegistryDto: UpdateApiRegistryDto) {
    this.logger.log(`Updating API registry: ${id}`);
    return this.apiRegistryService.update(id, updateApiRegistryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.logger.log(`Deleting API registry: ${id}`);
    return this.apiRegistryService.remove(id);
  }

  @Get(':id/features')
  findFeatures(@Param('id') id: string) {
    this.logger.log(`Getting features for API: ${id}`);
    return this.apiRegistryService.findFeaturesByApiId(id);
  }

  @Get(':id/features/:featureId/endpoints')
  findEndpoints(@Param('id') id: string, @Param('featureId') featureId: string) {
    this.logger.log(`Getting endpoints for feature: ${featureId}`);
    return this.apiRegistryService.findEndpointsByFeatureId(featureId);
  }
}
