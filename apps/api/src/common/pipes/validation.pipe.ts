import {
  HttpStatus,
  ValidationPipe as NestValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppException } from '../exceptions/app.exception.js';

function collectErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((details, error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const constraints = Object.values(error.constraints ?? {});

    if (constraints.length > 0) {
      details[path] = constraints;
    }

    Object.assign(details, collectErrors(error.children ?? [], path));
    return details;
  }, {});
}

export class ValidationPipe extends NestValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new AppException(
          'errors.request.validation_failed',
          HttpStatus.BAD_REQUEST,
          collectErrors(errors),
        ),
    });
  }
}
