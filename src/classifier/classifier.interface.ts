import { Command } from './classifier.enum';

export interface CommandTask {
  command: Command;
  prompt: string;
}

export interface ClassificationResult {
  tasks: CommandTask[];
}

export interface ClassifyRequestInput {
  message: string;
}
