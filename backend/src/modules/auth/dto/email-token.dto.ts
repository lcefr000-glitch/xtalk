import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @Length(8, 72)
  newPassword!: string;
}
