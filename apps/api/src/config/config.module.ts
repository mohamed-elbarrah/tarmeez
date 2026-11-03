import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { appConfig } from './app.config.js';
import { authConfig } from './auth.config.js';
import { bullConfig } from './bull.config.js';
import { databaseConfig } from './database.config.js';
import { jwtConfig } from './jwt.config.js';
import { mailConfig } from './mail.config.js';

const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(4000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^[1-9]\d*(ms|s|m|h|d)$/)
    .default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^[1-9]\d*(ms|s|m|h|d)$/)
    .default('7d'),
  JWT_ISSUER: Joi.string().min(1).default('tarmeez-api'),
  JWT_AUDIENCE: Joi.string().min(1).default('tarmeez-client'),
  AUTH_OTP_PEPPER: Joi.string().min(32).required(),
  AUTH_OTP_EXPIRES_IN_MINUTES: Joi.number()
    .integer()
    .min(1)
    .max(60)
    .default(10),
  AUTH_OTP_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(3600)
    .default(60),
  AUTH_OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(5),
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(1025),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().min(1).default('Tarmeez <no-reply@localhost>'),
  REDIS_HOST: Joi.string().min(1).default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
  SALLA_CLIENT_ID: Joi.string().allow('').optional(),
  SALLA_CLIENT_SECRET: Joi.string().allow('').optional(),
  SALLA_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  ZID_CLIENT_ID: Joi.string().allow('').optional(),
  ZID_CLIENT_SECRET: Joi.string().allow('').optional(),
  META_APP_ID: Joi.string().allow('').optional(),
  META_APP_SECRET: Joi.string().allow('').optional(),
}).unknown(true);

function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = environmentSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    throw error;
  }

  return value as Record<string, unknown>;
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        authConfig,
        mailConfig,
        bullConfig,
      ],
      validate: validateEnvironment,
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
