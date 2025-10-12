import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { Logger } from '@nestjs/common';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        
        const dbConfig = {
          type: 'postgres' as const,
          host: config.database.host,
          port: config.database.port,
          username: config.database.username,
          password: config.database.password,
          database: config.database.database,
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          synchronize: config.environment === 'development',
        };

        logger.log('Database connection configured');

        return dbConfig;
      },
    }),
  ],
})
export class DatabaseModule {}
