import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';

class CorrectDto {
  @IsString() @Length(1, 2000) text!: string;
  @Matches(/^[a-z]{2}$/) language!: string;
  @Matches(/^[a-z]{2}$/) explainIn!: string;
}

class TurnDto {
  @IsIn(['user', 'model']) role!: 'user' | 'model';
  @IsString() @Length(1, 1000) text!: string;
}

class TutorDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TurnDto) history!: TurnDto[];
  @Matches(/^[a-z]{2}$/) language!: string;
  @IsIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) level!: string;
  @Matches(/^[a-z]{2}$/) explainIn!: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.ai.status(user.id);
  }

  @Post('correct')
  correct(@CurrentUser() user: AuthUser, @Body() dto: CorrectDto) {
    return this.ai.correct(user.id, dto.text, dto.language, dto.explainIn);
  }

  @Post('tutor')
  tutor(@CurrentUser() user: AuthUser, @Body() dto: TutorDto) {
    return this.ai.tutor(user.id, dto.history, dto.language, dto.level, dto.explainIn);
  }
}
