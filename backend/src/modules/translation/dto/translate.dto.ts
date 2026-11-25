import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class TranslateDto {
  @IsString()
  @Length(1, 2000)
  text!: string;

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  source?: string;

  @Matches(/^[a-z]{2}$/)
  target!: string;
}

export class TranslateMessageDto {
  @Matches(/^[a-z]{2}$/)
  target!: string;
}

export class DetectDto {
  @IsString()
  @Length(1, 2000)
  text!: string;
}
