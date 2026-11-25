import { Transform, Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';

export enum LanguageTypeDto {
  NATIVE = 'NATIVE',
  LEARNING = 'LEARNING',
}

export enum ProficiencyDto {
  BEGINNER = 'BEGINNER',
  ELEMENTARY = 'ELEMENTARY',
  INTERMEDIATE = 'INTERMEDIATE',
  UPPER_INTERMEDIATE = 'UPPER_INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  FLUENT = 'FLUENT',
  NATIVE = 'NATIVE',
}

export class AddUserLanguageDto {
  /** ISO 639-1 two-letter code, e.g. "en", "ar". */
  @IsString()
  @Matches(/^[a-z]{2}$/, { message: 'code must be an ISO 639-1 two-letter code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  code!: string;

  @IsEnum(LanguageTypeDto)
  type!: LanguageTypeDto;

  @IsEnum(ProficiencyDto)
  proficiency!: ProficiencyDto;

  /** Optional learning goal for this language. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  dailyMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  goalText?: string;
}

export class UpdateUserLanguageDto {
  @IsOptional()
  @IsEnum(ProficiencyDto)
  proficiency?: ProficiencyDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  dailyMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  goalText?: string;
}
