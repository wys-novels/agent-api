import { IsUrl, IsOptional } from 'class-validator';

export class UpdateApiRegistryDto {
  @IsUrl()
  @IsOptional()
  swaggerUrl?: string;
}
