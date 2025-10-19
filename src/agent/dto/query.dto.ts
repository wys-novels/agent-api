import { IsString, IsNotEmpty, Length } from 'class-validator';

export class QueryDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}
