import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export class CreateCollectionDto {
  @IsString() @IsNotEmpty() @Length(1, 80) name!: string;
  @IsString() @Length(2, 10) languageCode!: string;
}

export class SaveItemDto {
  @IsString() @IsNotEmpty() @MaxLength(500) term!: string;
  @IsString() @Length(2, 10) languageCode!: string;
  @IsOptional() @IsString() @MaxLength(500) translation?: string;
  @IsOptional() @IsString() @Length(2, 10) translationLanguageCode?: string;
  @IsOptional() @IsString() @MaxLength(1000) definition?: string;
  @IsOptional() @IsString() @MaxLength(1000) example?: string;
  @IsOptional() @IsString() @MaxLength(500) pronunciation?: string;
  @IsOptional() @IsIn(['WORD', 'EXPRESSION', 'SENTENCE']) kind?: 'WORD' | 'EXPRESSION' | 'SENTENCE';
  @IsOptional() @IsUUID() collectionId?: string;
  @IsOptional() @IsUUID() sourceMessageId?: string;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MaxLength(500) translation?: string;
  @IsOptional() @IsString() @MaxLength(1000) definition?: string;
  @IsOptional() @IsString() @MaxLength(1000) example?: string;
  @IsOptional() @IsString() @MaxLength(500) pronunciation?: string;
  @IsOptional() @IsUUID() collectionId?: string;
}

export class ReviewDto {
  /** SM-2 quality: 0 blackout .. 5 perfect. */
  @IsInt() @Min(0) @Max(5) quality!: number;
}
