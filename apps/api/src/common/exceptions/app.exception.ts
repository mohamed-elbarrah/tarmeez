import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorDetails = Record<string, string[]>;

export class AppException extends HttpException {
  constructor(
    readonly key: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: ErrorDetails,
  ) {
    super({ key, details }, statusCode);
  }
}
