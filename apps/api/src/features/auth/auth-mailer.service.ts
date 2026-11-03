import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class AuthMailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('mail.user', '');
    const password = config.get<string>('mail.password', '');

    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('mail.host'),
      port: config.getOrThrow<number>('mail.port'),
      secure: config.getOrThrow<boolean>('mail.secure'),
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    this.from = config.getOrThrow<string>('mail.from');
  }

  async sendSignupVerificationCode(email: string, code: string): Promise<void> {
    await this.sendCodeEmail(
      email,
      code,
      'Verify your Tarmeez account',
      'signup verification',
    );
  }

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    await this.sendCodeEmail(
      email,
      code,
      'Reset your Tarmeez password',
      'password reset',
    );
  }

  private async sendCodeEmail(
    email: string,
    code: string,
    subject: string,
    purpose: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      text: `Your Tarmeez ${purpose} code is ${code}. It expires shortly. If you did not request this, ignore this email.`,
    });
  }
}
