import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() input: VerifyEmailDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyEmail(input);
    response.setHeader(
      'Set-Cookie',
      `${result.refreshCookieName}=${encodeURIComponent(result.refreshToken)}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${Math.floor(result.refreshTokenMaxAge / 1000)}${result.refreshCookieSecure ? '; Secure' : ''}`,
    );
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }
}
