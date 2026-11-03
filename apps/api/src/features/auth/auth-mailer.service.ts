import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class AuthMailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('mail.user', '');
    const password = this.config.get<string>('mail.password', '');

    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('mail.host'),
      port: this.config.getOrThrow<number>('mail.port'),
      secure: this.config.getOrThrow<boolean>('mail.secure'),
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    this.from = this.config.getOrThrow<string>('mail.from');
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

  async sendTeamInvitation(
    email: string,
    merchantName: string,
    inviterName: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = new URL(
      '/accept-invitation',
      this.config.getOrThrow<string>('app.frontendUrl'),
    );
    acceptUrl.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: `Invitation to join ${merchantName} on Tarmeez`,
      text: `${inviterName} invited you to join ${merchantName} on Tarmeez as a viewer. Accept the invitation: ${acceptUrl.toString()}. The invitation expires in 7 days.`,
    });
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
