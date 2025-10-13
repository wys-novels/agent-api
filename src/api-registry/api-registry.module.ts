import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiRegistryService } from './api-registry.service';
import { ApiRegistryController } from './api-registry.controller';
import { ApiRegistry } from './api-registry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApiRegistry])],
  controllers: [ApiRegistryController],
  providers: [ApiRegistryService],
  exports: [ApiRegistryService],
})
export class ApiRegistryModule {}
