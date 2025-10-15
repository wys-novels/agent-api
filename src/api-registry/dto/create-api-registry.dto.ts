import { IsUrl, IsNotEmpty } from 'class-validator';

export class CreateApiRegistryDto {
  @IsUrl()
  @IsNotEmpty()
  swaggerUrl: string;
}
