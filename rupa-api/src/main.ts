import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupGlobalPipesAndFilters } from './common/setup.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || '/api';
  const corsOrigin = configService.get<string>('app.corsOrigin') || 'http://localhost:4200';
  const isProduction = configService.get<string>('app.nodeEnv') === 'production';

  app.setGlobalPrefix(apiPrefix);

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-XSRF-TOKEN',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400,
  });

  setupGlobalPipesAndFilters(app);

  await app.listen(port);
  console.log(`🚀 Rupa API running on http://localhost:${port}${apiPrefix}`);
  console.log(`📍 Environment: ${configService.get<string>('app.nodeEnv')}`);
  console.log(`🔐 CORS origin: ${corsOrigin}`);
  console.log(`🍪 Cookie secure: ${isProduction}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
