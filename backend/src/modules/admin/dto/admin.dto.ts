import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @Length(3, 200)
  email!: string;

  @IsString()
  @Length(1, 100)
  password!: string;
}

export class ResolveReportDto {
  @IsIn(['WARN', 'RESTRICT', 'SUSPEND', 'REMOVE_CONTENT', 'DISMISS_REPORT'])
  action!: 'WARN' | 'RESTRICT' | 'SUSPEND' | 'REMOVE_CONTENT' | 'DISMISS_REPORT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
