import { IsString, MaxLength, MinLength } from 'class-validator';

export class StartSallaConnectionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  storeUrl!: string;
}
