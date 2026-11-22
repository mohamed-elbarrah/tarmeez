import { IsIn, IsString, Length } from 'class-validator';

export class UpdateCampaignStatusDto {
  @IsIn(['ACTIVE', 'PAUSED'])
  status!: 'ACTIVE' | 'PAUSED';

  @IsString()
  @Length(1, 100)
  expectedStatus!: string;

  @IsString()
  @Length(16, 128)
  idempotencyKey!: string;
}
