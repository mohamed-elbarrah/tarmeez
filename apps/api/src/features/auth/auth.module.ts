import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthMailerService } from './auth-mailer.service.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthMailerService, AuthRepository, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
