import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CommerceDataQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage = 25;
}
