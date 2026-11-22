import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CompleteMetaConnectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  accountIds!: string[];
}
