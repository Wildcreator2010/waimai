import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app);
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 8787);
  await app.listen(port, '0.0.0.0');
  logger.log(`服务已启动：http://127.0.0.1:${port}/api/health`);
}

void bootstrap();
