import {
  INestApplication,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';

export function setupGlobalPipesAndFilters(app: INestApplication): void {
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((error) => ({
          field: error.property,
          constraints: error.constraints,
        }));
        logger.error('Validation error', JSON.stringify(formattedErrors));
        return {
          statusCode: 400,
          message: 'Validation failed',
          errors: formattedErrors,
        };
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
