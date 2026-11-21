import { IsOptional, IsString } from 'class-validator';

export class SallaCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  error_description?: string;
}
