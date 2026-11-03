import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { hash } from 'bcryptjs';
import { isEmail } from 'class-validator';
import { AppConfigModule } from '../config/config.module.js';
import { AuthModule } from '../features/auth/auth.module.js';
import { AuthRepository } from '../features/auth/auth.repository.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { Module } from '@nestjs/common';

const PASSWORD_HASH_ROUNDS = 12;
const DEFAULT_ADMIN_EMAIL = 'admin@tarmeez.com';

@Module({ imports: [AppConfigModule, PrismaModule, AuthModule] })
class BootstrapAdminModule {}

async function promptHidden(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command from an interactive terminal.');
  }

  stdout.write(label);
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          finish(new Error('Admin bootstrap cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function collectAdminDetails(): Promise<{
  email: string;
  name: string;
  password: string;
}> {
  const prompts = createInterface({ input: stdin, output: stdout });
  let email = '';
  let name = '';
  try {
    email = (await prompts.question(`Admin email [${DEFAULT_ADMIN_EMAIL}]: `))
      .trim()
      .toLowerCase();
    name = (await prompts.question('Admin name [Tarmeez Admin]: ')).trim();
  } finally {
    prompts.close();
  }

  email ||= DEFAULT_ADMIN_EMAIL;
  name ||= 'Tarmeez Admin';
  if (!isEmail(email)) throw new Error('Enter a valid admin email address.');
  if (name.length > 120)
    throw new Error('Admin name must be at most 120 characters.');

  const password = await promptHidden('Admin password (input hidden): ');
  const confirmation = await promptHidden('Confirm password (input hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error(
      'Password must be at least 12 characters and at most 72 bytes.',
    );
  }

  return { email, name, password };
}

async function bootstrapAdmin(): Promise<void> {
  const details = await collectAdminDetails();
  const passwordHash = await hash(details.password, PASSWORD_HASH_ROUNDS);
  const app = await NestFactory.createApplicationContext(BootstrapAdminModule, {
    logger: ['error'],
  });

  try {
    const repository = app.get(AuthRepository);
    const result = await repository.createFirstAdmin({
      email: details.email,
      name: details.name,
      passwordHash,
      now: new Date(),
    });

    if (result === 'ADMIN_EXISTS') {
      throw new Error('An admin account already exists; no changes were made.');
    }
    if (result === 'EMAIL_EXISTS') {
      throw new Error(
        'That email already belongs to an account; no changes were made.',
      );
    }
    stdout.write(
      `Created the first verified admin account: ${details.email}\n`,
    );
  } finally {
    await app.close();
  }
}

try {
  await bootstrapAdmin();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown bootstrap error.';
  console.error(`Admin bootstrap failed: ${message}`);
  process.exitCode = 1;
}
