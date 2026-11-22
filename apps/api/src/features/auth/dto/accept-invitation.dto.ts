import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class AcceptInvitationDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @IsByteLength(8, 72)
  password!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  invitationToken!: string;
}
