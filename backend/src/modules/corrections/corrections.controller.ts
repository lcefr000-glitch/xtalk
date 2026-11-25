import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CorrectionsService } from './corrections.service';

class CorrectDto {
  @IsString()
  @Length(1, 2000)
  text!: string;

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  language?: string;
}

class TutorDto {
  @IsString()
  @Length(1, 2000)
  message!: string;

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  language?: string;
}

@ApiTags('language-tools')
@ApiBearerAuth()
@Controller()
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  @Post('corrections')
  correct(@Body() dto: CorrectDto) {
    return this.corrections.correct(dto.text, dto.language);
  }

  @Post('corrections/message/:id')
  correctMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectDto,
  ) {
    return this.corrections.correctMessage(user.id, id, dto.language);
  }

  @Post('tutor/chat')
  tutor(@CurrentUser() user: AuthUser, @Body() dto: TutorDto) {
    return this.corrections.tutor(user.id, dto.message, dto.language);
  }
}
