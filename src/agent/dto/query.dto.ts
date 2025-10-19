import { IsString, IsNotEmpty, Length } from 'class-validator';

export class QueryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 1000)
  message: string;
}
