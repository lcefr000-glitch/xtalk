import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsIn(['USER', 'MESSAGE', 'POST', 'COMMENT', 'VOICE_ROOM'])
  targetType!: 'USER' | 'MESSAGE' | 'POST' | 'COMMENT' | 'VOICE_ROOM';

  @IsString()
  @Length(1, 64)
  targetId!: string;

  @IsString()
  @Length(3, 100)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
