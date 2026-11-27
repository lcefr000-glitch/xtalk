import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @Matches(/^[a-z0-9_]{3,20}$/, {
    message: 'username must be 3-20 chars of lowercase letters, digits or underscore',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  username!: string;

  @IsString()
  @Length(8, 72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one digit',
  })
  password!: string;

  @IsString()
  @Length(1, 50)
  displayName!: string;

  /** ISO date (YYYY-MM-DD). Used for age-aware onboarding (min age 13). */
  @IsDateString()
  dateOfBirth!: string;

  /** ISO 3166-1 alpha-2, picked at signup. Cannot be changed later. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code' })
  country?: string;

  /** 6-digit code emailed by POST /auth/signup-code (required once the server can send email). */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  emailCode?: string;
}
