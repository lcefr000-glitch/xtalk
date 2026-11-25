import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DetectDto, TranslateDto, TranslateMessageDto } from './dto/translate.dto';
import { TranslationService } from './translation.service';

@ApiTags('translation')
@ApiBearerAuth()
@Controller()
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  @Post('translate')
  translate(@Body() dto: TranslateDto) {
    return this.translation.translate(dto.text, dto.source, dto.target);
  }

  @Post('translate/detect')
  detect(@Body() dto: DetectDto) {
    return this.translation.detect(dto.text);
  }

  @Post('translate/message/:id')
  translateMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TranslateMessageDto,
  ) {
    return this.translation.translateMessage(user.id, id, dto.target);
  }

  @Get('translations/history')
  history(@CurrentUser() user: AuthUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.translation.history(user.id, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 30);
  }

  @HttpCode(200)
  @Delete('translations/:id')
  deleteSaved(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.translation.deleteSaved(user.id, id);
  }
}
