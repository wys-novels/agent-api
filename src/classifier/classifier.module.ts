import { Module } from '@nestjs/common';
import { OpenAIModule } from '../openai/openai.module';
import { ClassifierService } from './classifier.service';

@Module({
  imports: [OpenAIModule],
  providers: [ClassifierService],
  exports: [ClassifierService],
})
export class ClassifierModule {}
