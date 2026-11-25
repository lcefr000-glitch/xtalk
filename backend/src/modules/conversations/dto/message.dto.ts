import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl,
  Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @Length(1, 64)
  userId!: string; // the other participant (1:1 conversations in Phase 3)
}

export class AttachmentDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  byteSize!: number;
}

export class SendMessageDto {
  @IsIn(['TEXT', 'IMAGE', 'VOICE'])
  type!: 'TEXT' | 'IMAGE' | 'VOICE';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class EditMessageDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}
