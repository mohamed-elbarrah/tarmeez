import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthUser } from '../../common/types/auth-user.types.js';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

const REFRESH_COOKIE_NAME = 'tarmeez_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() input: VerifyEmailDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyEmail(input);
    this.setRefreshCookie(response, result);
    return this.sessionResponse(result);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(input);
    this.setRefreshCookie(response, result);
    return this.sessionResponse(result);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.refresh(
        this.readRefreshCookie(request),
      );
      this.setRefreshCookie(response, result);
      return this.sessionResponse(result);
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(this.readRefreshCookie(request));
    this.clearRefreshCookie(response);
    return { messageKey: 'success.auth.logged_out' };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() input: ForgotPasswordDto) {
    return this.authService.forgotPassword(input);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() input: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.resetPassword(input);
    this.clearRefreshCookie(response);
    return { messageKey: 'success.auth.password_reset' };
  }

  private sessionResponse(
    result: Awaited<ReturnType<AuthService['verifyEmail']>>,
  ) {
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  private setRefreshCookie(
    response: Response,
    result: Awaited<ReturnType<AuthService['verifyEmail']>>,
  ): void {
    response.setHeader(
      'Set-Cookie',
      `${result.refreshCookieName}=${encodeURIComponent(result.refreshToken)}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${Math.floor(result.refreshTokenMaxAge / 1000)}${result.refreshCookieSecure ? '; Secure' : ''}`,
    );
  }

  private clearRefreshCookie(response: Response): void {
    const secure =
      this.config.getOrThrow<string>('app.environment') === 'production'
        ? '; Secure'
        : '';
    response.setHeader(
      'Set-Cookie',
      `${REFRESH_COOKIE_NAME}=; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
    );
  }

  private readRefreshCookie(request: Request): string | undefined {
    const prefix = `${REFRESH_COOKIE_NAME}=`;
    const value = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    return value ? decodeURIComponent(value) : undefined;
  }
}
