import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

class VerifyPurchaseDto {
  @IsString()
  productId!: string;

  @IsString()
  purchaseToken!: string;
}

class DevActivateDto {
  @IsIn(['1m', '3m', '1y', 'life'])
  tier!: string;
}

class VipLookupDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.subs.mySubscription(user.id);
  }

  @Get('entitlements')
  entitlements(@CurrentUser() user: AuthUser) {
    return this.subs.entitlements(user.id);
  }

  @Post('google-play/verify')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyPurchaseDto) {
    return this.subs.verifyGooglePlayPurchase(user.id, dto.productId, dto.purchaseToken);
  }

  /** TEST MODE: activates VIP with no payment. Disabled with DEV_BILLING=off. */
  @Post('dev-activate')
  devActivate(@CurrentUser() user: AuthUser, @Body() dto: DevActivateDto) {
    return this.subs.devActivate(user.id, dto.tier);
  }

  /** Which of these users have an active VIP plan (for badges). */
  @HttpCode(200)
  @Post('vip-lookup')
  vipLookup(@Body() dto: VipLookupDto) {
    return this.subs.vipLookup(dto.ids);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.subs.history(user.id);
  }
}
