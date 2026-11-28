import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatExtrasService } from './chat-extras.service';

class ReactDto {
  @IsString()
  @MaxLength(16)
  emoji!: string;
}

class FixDto {
  @IsString()
  @MaxLength(2000)
  text!: string;
}

class FlagDto {
  @IsBoolean()
  value!: boolean;
}

@ApiTags('chat-extras')
@ApiBearerAuth()
@Controller('chat-extras')
export class ChatExtrasController {
  constructor(private readonly extras: ChatExtrasService) {}

  @Post('messages/:id/react')
  @HttpCode(200)
  react(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReactDto) {
    return this.extras.react(user.id, id, dto.emoji);
  }

  @Get('conversations/:id/reactions')
  reactions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.forConversation(user.id, id);
  }

  @Post('messages/:id/fix')
  @HttpCode(200)
  fix(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FixDto) {
    return this.extras.fixMessage(user.id, id, dto.text);
  }

  @Post('messages/:id/fix/remove')
  @HttpCode(200)
  removeFix(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.removeFix(user.id, id);
  }

  @Get('conversations/:id/fixes')
  fixes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.fixesForConversation(user.id, id);
  }

  @Get('pins')
  pins(@CurrentUser() user: AuthUser) {
    return this.extras.pins(user.id);
  }

  @Post('pins/:id')
  @HttpCode(200)
  togglePin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.togglePin(user.id, id);
  }

  @Get('favorites')
  favorites(@CurrentUser() user: AuthUser) {
    return this.extras.favorites(user.id);
  }

  @Post('favorites/:userId')
  @HttpCode(200)
  toggleFavorite(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.extras.toggleFavorite(user.id, userId);
  }

  @Get('flags')
  flags(@CurrentUser() user: AuthUser) {
    return this.extras.flags(user.id);
  }

  @Post('conversations/:id/mute')
  @HttpCode(200)
  mute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FlagDto) {
    return this.extras.setFlag(user.id, id, 'muted', dto.value);
  }

  @Post('conversations/:id/archive')
  @HttpCode(200)
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FlagDto) {
    return this.extras.setFlag(user.id, id, 'archived', dto.value);
  }

  @Post('messages/:id/star')
  @HttpCode(200)
  star(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.toggleStar(user.id, id);
  }

  @Get('stars')
  stars(@CurrentUser() user: AuthUser) {
    return this.extras.stars(user.id);
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query('q') q: string = '') {
    return this.extras.search(user.id, String(q));
  }
}
