import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EconomyService } from './economy.service';

class SendGiftDto {
  @IsUUID()
  roomId!: string;

  @IsString()
  receiverId!: string;

  @IsString()
  giftId!: string;
}

class ExchangeDto {
  @IsInt()
  @Min(1)
  @Max(1000000)
  diamonds!: number;
}

class ExchangeVipDto {
  @IsString()
  tier!: string;
}

class LevelsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

@ApiTags('economy')
@ApiBearerAuth()
@Controller('economy')
export class EconomyController {
  constructor(private readonly economy: EconomyService) {}

  @Get('leaderboard')
  leaderboard(@CurrentUser() user: AuthUser, @Query('kind') kind?: string, @Query('period') period?: string) {
    return this.economy.leaderboard(user.id, kind ?? 'spent', period ?? 'day');
  }

  @Get('rooms/:roomId/leaderboard')
  roomLeaderboard(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Query('period') period?: string) {
    return this.economy.roomLeaderboard(user.id, roomId, period ?? 'day');
  }

  @Get('diamonds')
  diamonds(@CurrentUser() user: AuthUser) {
    return this.economy.diamonds(user.id);
  }

  @HttpCode(200)
  @Post('diamonds/exchange-coins')
  exchangeCoins(@CurrentUser() user: AuthUser, @Body() dto: ExchangeDto) {
    return this.economy.exchangeToCoins(user.id, dto.diamonds);
  }

  @HttpCode(200)
  @Post('diamonds/exchange-vip')
  exchangeVip(@CurrentUser() user: AuthUser, @Body() dto: ExchangeVipDto) {
    return this.economy.exchangeToVip(user.id, dto.tier);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.economy.me(user.id);
  }

  @Get('gifts')
  gifts() {
    return this.economy.gifts();
  }

  @Post('levels')
  @HttpCode(200)
  levels(@Body() dto: LevelsDto) {
    return this.economy.levelsOf(dto.ids);
  }

  @Get('level/:userId')
  level(@Param('userId') userId: string) {
    return this.economy.levelOf(userId);
  }

  @HttpCode(200)
  @Post('test-grant')
  grant(@CurrentUser() user: AuthUser) {
    return this.economy.testGrant(user.id);
  }

  @HttpCode(200)
  @Post('gifts/send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendGiftDto) {
    return this.economy.sendGift(user.id, dto.roomId, dto.receiverId, dto.giftId);
  }

  @Get('rooms/:roomId/gifts')
  roomGifts(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Query('since') since?: string) {
    return this.economy.roomGifts(roomId, since, user.id);
  }
}
