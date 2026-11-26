import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, Length, Matches, MaxLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @Length(1, 2000)
  body!: string;

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  languageCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUrl({ require_tld: false }, { each: true })
  imageUrls?: string[];
}

export class CreateCommentDto {
  @IsString()
  @Length(1, 1000)
  body!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class EditPostDto {
  @IsString()
  @Length(1, 2000)
  body!: string;
}
