import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export const LESSON_KINDS = ['GRAMMAR', 'VOCABULARY', 'LISTENING', 'SPEAKING', 'READING', 'WRITING', 'QUIZ'] as const;
export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

export class UpsertCourseDto {
  @IsString() @IsNotEmpty() @Length(3, 120) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @Length(2, 10) languageCode!: string;
  @IsIn(COURSE_LEVELS) level!: (typeof COURSE_LEVELS)[number];
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(8) coverEmoji?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpsertLessonDto {
  @IsString() @IsNotEmpty() @Length(2, 160) title!: string;
  @IsIn(LESSON_KINDS) kind!: (typeof LESSON_KINDS)[number];
  /** Lesson body: markdown text or JSON-encoded quiz/exercise payload. */
  @IsString() @IsNotEmpty() @MaxLength(50_000) content!: string;
  @IsInt() @Min(0) @Max(10_000) position!: number;
  @IsOptional() @IsInt() @Min(1) @Max(600) durationMin?: number;
}

export class CompleteLessonDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
}

export class ReorderDto {
  @IsUUID() lessonId!: string;
  @IsInt() @Min(0) @Max(10_000) position!: number;
}
