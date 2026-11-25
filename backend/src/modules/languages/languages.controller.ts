import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AddUserLanguageDto, UpdateUserLanguageDto } from './dto/user-language.dto';
import { LanguagesService } from './languages.service';

@ApiTags('languages')
@Controller()
export class LanguagesController {
  constructor(private readonly languages: LanguagesService) {}

  /** Public catalogue - used by the onboarding language picker before login. */
  @Public()
  @Get('languages')
  list(@Query('search') search?: string, @Query('rtl') rtl?: string) {
    return this.languages.list(search, rtl === undefined ? undefined : rtl === 'true');
  }

  @ApiBearerAuth()
  @Get('users/me/languages')
  getMine(@CurrentUser() user: AuthUser) {
    return this.languages.getUserLanguages(user.id);
  }

  @ApiBearerAuth()
  @Post('users/me/languages')
  add(@CurrentUser() user: AuthUser, @Body() dto: AddUserLanguageDto) {
    return this.languages.addUserLanguage(user.id, dto);
  }

  @ApiBearerAuth()
  @Patch('users/me/languages/:code')
  update(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: UpdateUserLanguageDto,
  ) {
    return this.languages.updateUserLanguage(user.id, code.toLowerCase(), dto);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Delete('users/me/languages/:code')
  remove(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.languages.removeUserLanguage(user.id, code.toLowerCase());
  }
}
