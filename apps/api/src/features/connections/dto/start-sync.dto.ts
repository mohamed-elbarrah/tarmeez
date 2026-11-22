import { IsEnum, IsOptional } from 'class-validator';
import { SyncResource } from '../../../generated/prisma/client.js';

export class StartSyncDto {
  @IsOptional()
  @IsEnum(SyncResource)
  resource?: SyncResource;
}
