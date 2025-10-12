import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { OpenAIService } from './openai.service';

@Module({
  imports: [ConfigModule],
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
