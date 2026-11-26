import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class DiscoveryQueryDto {
  /** Users who have this language as NATIVE (ISO 639-1). */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  native?: string;

  /** Users who are LEARNING this language. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  learning?: string;

  /** ISO 3166-1 alpha-2. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  country?: string;

  @IsOptional()
  @IsString()
  interest?: string;

  /** Username (or display name) fragment, case-insensitive. */
  @IsOptional()
  @IsString()
  @Matches(/^@?[A-Za-z0-9_ ]{1,30}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@/, '') : value))
  q?: string;

  /** Proficiency of the searched language: BEGINNER..NATIVE. */
  @IsOptional()
  @IsString()
  proficiency?: string;

  /** active (default) | match */
  @IsOptional()
  @IsString()
  @Matches(/^(active|match)$/)
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
