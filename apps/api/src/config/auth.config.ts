import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  otpPepper: process.env.AUTH_OTP_PEPPER,
  otpExpiresInMinutes: Number(process.env.AUTH_OTP_EXPIRES_IN_MINUTES ?? 10),
  otpResendCooldownSeconds: Number(
    process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS ?? 60,
  ),
  otpMaxAttempts: Number(process.env.AUTH_OTP_MAX_ATTEMPTS ?? 5),
}));
