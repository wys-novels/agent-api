import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { Command } from './classifier.enum';
import { ClassificationResult, CommandTask } from './classifier.interface';

@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(ClassifierService.name);

  constructor(private readonly openaiService: OpenAIService) {}

  async classifyRequest(message: string): Promise<ClassificationResult> {
    this.logger.log(`Classifying request: ${message}`);

    const prompt = this.buildClassificationPrompt(message);
    
    try {
      const response = await this.openaiService.generateAnswer({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const tasks = this.parseTasks(response.content, message);
      
      // Убеждаемся что GENERATE всегда в конце
      const finalTasks = this.ensureGenerateAtEnd(tasks);

      this.logger.log(`Classified tasks: ${finalTasks.map(t => `${t.command}(${t.prompt})`).join(', ')}`);

      return {
        tasks: finalTasks,
      };
    } catch (error) {
      this.logger.error('Error classifying request:', error);
      // В случае ошибки возвращаем только GENERATE с полным промптом
      return {
        tasks: [{ command: Command.GENERATE, prompt: message }],
      };
    }
  }

  private buildClassificationPrompt(message: string): string {
    const availableCommands = this.getAvailableCommands();
    
    return `<task>
Проанализируй следующий запрос пользователя и разбей его на задачи с соответствующими командами.
</task>

<available_commands>
${availableCommands}
</available_commands>

<user_request>
"${message}"
</user_request>

<rules>
1. Если запрос требует получения данных из интернета/API - создай задачу HTTP_TOOL с соответствующим промптом
2. Если запрос требует простого ответа или объяснения - создай задачу GENERATE с полным промптом
3. GENERATE всегда должен быть последней задачей в цепочке
4. Для каждой задачи укажи команду и промпт в формате: "КОМАНДА: промпт"
</rules>

<response_format>
КОМАНДА: промпт
</response_format>

<response>`;
  }

  private getAvailableCommands(): string {
    const commandDescriptions = {
      [Command.GENERATE]: 'Генерация текстового ответа (всегда должна быть в конце цепочки)',
      [Command.HTTP_TOOL]: 'Обращение к HTTP API для получения данных',
    };

    return Object.values(Command)
      .map(cmd => `- ${cmd}: ${commandDescriptions[cmd]}`)
      .join('\n');
  }

  private parseTasks(response: string, originalMessage: string): CommandTask[] {
    const tasks: CommandTask[] = [];
    const lines = response.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const match = line.match(/^(HTTP_TOOL|GENERATE):\s*(.+)$/i);
      if (match) {
        const command = match[1].toUpperCase() as Command;
        const prompt = match[2].trim();
        tasks.push({ command, prompt });
      }
    }

    // Если задачи не найдены, возвращаем GENERATE с полным промптом
    if (tasks.length === 0) {
      tasks.push({ command: Command.GENERATE, prompt: originalMessage });
    }

    return tasks;
  }

  private ensureGenerateAtEnd(tasks: CommandTask[]): CommandTask[] {
    // Убираем все GENERATE из середины
    const filteredTasks: CommandTask[] = tasks.filter(task => task.command !== Command.GENERATE);
    
    // Добавляем GENERATE в конец
    const generateTask = tasks.find(task => task.command === Command.GENERATE);
    if (generateTask) {
      filteredTasks.push(generateTask);
    } else {
      // Если не было GENERATE, добавляем с полным промптом
      filteredTasks.push({ command: Command.GENERATE, prompt: 'Сформировать ответ пользователю' });
    }
    
    return filteredTasks;
  }
}
