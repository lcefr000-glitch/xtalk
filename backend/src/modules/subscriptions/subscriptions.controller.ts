import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

class VerifyPurchaseDto {
  @IsString()
  productId!: string;

  @IsString()
  purchaseToken!: string;
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

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.subs.history(user.id);
  }
}
