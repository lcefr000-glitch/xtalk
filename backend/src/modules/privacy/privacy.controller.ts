import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrivacyService } from './privacy.service';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { ...(await this.privacy.get(user.id)), vip: await this.privacy.isVip(user.id) };
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const pick = (k: string) => (typeof body?.[k] === 'boolean' ? (body[k] as boolean) : undefined);
    return this.privacy.update(user.id, {
      showCountry: pick('showCountry'), showFollowLists: pick('showFollowLists'), discoverable: pick('discoverable'),
      hideMoments: pick('hideMoments'), hideVisitors: pick('hideVisitors'),
    });
  }
}
