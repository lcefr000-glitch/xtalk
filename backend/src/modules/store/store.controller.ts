import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { StoreService } from './store.service';

class RedeemDto {
  @IsString()
  @MaxLength(40)
  code!: string;
}

class BuyVipDto {
  @IsString()
  @MaxLength(10)
  tier!: string;
}

@ApiTags('store')
@ApiBearerAuth()
@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('vip/status')
  vipStatus(@CurrentUser() user: AuthUser) {
    return this.store.vipStatus(user.id);
  }

  @Get('catalog')
  catalog() {
    return this.store.catalog();
  }

  /** Redeem a code bought from the owner. Tight limit so codes cannot be guessed. */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('redeem')
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemDto) {
    return this.store.redeem(user.id, dto.code);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('vip/buy')
  buyVip(@CurrentUser() user: AuthUser, @Body() dto: BuyVipDto) {
    return this.store.buyVipWithCoins(user.id, dto.tier);
  }
}
