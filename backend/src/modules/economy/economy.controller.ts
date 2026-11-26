import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
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

@ApiTags('economy')
@ApiBearerAuth()
@Controller('economy')
export class EconomyController {
  constructor(private readonly economy: EconomyService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.economy.me(user.id);
  }

  @Get('gifts')
  gifts() {
    return this.economy.gifts();
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
  roomGifts(@Param('roomId', ParseUUIDPipe) roomId: string, @Query('since') since?: string) {
    return this.economy.roomGifts(roomId, since);
  }
}
