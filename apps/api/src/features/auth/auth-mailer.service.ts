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
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    this.from = config.getOrThrow<string>('mail.from');
  }

  async sendSignupVerificationCode(email: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Verify your Tarmeez account',
      text: `Your Tarmeez verification code is ${code}. It expires shortly. If you did not request this, ignore this email.`,
    });
  }
}
