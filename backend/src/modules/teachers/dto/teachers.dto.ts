import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class AvailabilitySlotDto {
  /** 0 = Sunday .. 6 = Saturday */
  @IsInt() @Min(0) @Max(6) weekday!: number;
  /** Minutes from midnight, local to the teacher. */
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
}

export class UpsertTeacherProfileDto {
  @IsString() @IsNotEmpty() @Length(10, 2000) bio!: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) teachingLanguages!: string[];
  @IsOptional() @IsString() @MaxLength(2000) qualifications?: string;
  @IsOptional() @IsInt() @Min(0) @Max(80) experienceYears?: number;
  /** Price per 60-minute lesson in USD cents. */
  @IsInt() @Min(0) @Max(1_000_000) hourlyRateCents!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AvailabilitySlotDto)
  availability?: AvailabilitySlotDto[];
}

export class CreateBookingDto {
  @IsISO8601() startsAt!: string;
  @IsIn([30, 45, 60, 90, 120]) durationMin!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) feedback?: string;
}

export class VerifyTeacherDto {
  @IsBoolean() verified!: boolean;
}
