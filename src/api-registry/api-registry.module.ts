import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ApiRegistryService } from './api-registry.service';
import { ApiRegistryController } from './api-registry.controller';
import { SwaggerService } from './swagger.service';
import { ApiRegistry } from './api-registry.entity';
import { FeatureRegistry } from './feature-registry.entity';
import { EndpointRegistry } from './endpoint-registry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiRegistry, FeatureRegistry, EndpointRegistry]),
    HttpModule,
  ],
  controllers: [ApiRegistryController],
  providers: [ApiRegistryService, SwaggerService],
  exports: [ApiRegistryService],
})
export class ApiRegistryModule {}
