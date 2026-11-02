import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from '../exceptions/app.exception.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let key = 'errors.server.internal';
    let details: Record<string, string[]> | undefined;

    if (exception instanceof AppException) {
      key = exception.key;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      key = statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
        ? 'errors.server.internal'
        : 'errors.request.invalid';
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error('Unhandled request exception', stack);
    }

    response.status(statusCode).json({
      success: false,
      error: {
        key,
        statusCode,
        ...(details ? { details } : {}),
      },
    });
  }
}
