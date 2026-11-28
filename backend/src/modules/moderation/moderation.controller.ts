import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';

/** What a signed-in user sees of the safety system: notices, own penalties, appeals, mute and hide. */
@Controller('moderation')
export class ModerationController {
  constructor(private readonly mod: ModerationService) {}

  @Public() @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('appeals/signed-out') appealOut(@Body() b: { email?: string; password?: string; text?: string }) { return this.mod.appealLoggedOut(b?.email ?? '', b?.password ?? '', b?.text ?? ''); }

  @Get('notices') notices(@CurrentUser() u: AuthUser) { return this.mod.myNotices(u.id); }
  @Post('notices/read') read(@CurrentUser() u: AuthUser) { return this.mod.readNotices(u.id); }
  @Get('status') status(@CurrentUser() u: AuthUser) { return this.mod.myStatus(u.id); }
  @Post('appeals') appeal(@CurrentUser() u: AuthUser, @Body() b: { penaltyId?: string; text?: string }) { return this.mod.appeal(u.id, String(b?.penaltyId ?? ''), String(b?.text ?? '')); }

  @Get('mutes') mutes(@CurrentUser() u: AuthUser) { return this.mod.mutedList(u.id); }
  @Post('mutes/:id') mute(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.mod.mute(u.id, id); }
  @Delete('mutes/:id') unmute(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.mod.unmute(u.id, id); }
  @Put('hidden') hide(@CurrentUser() u: AuthUser, @Body() b: { type?: string; id?: string }) { return this.mod.hide(u.id, String(b?.type ?? ''), String(b?.id ?? '')); }
  @Get('hidden/:type') hidden(@CurrentUser() u: AuthUser, @Param('type') type: string) { return this.mod.hiddenIds(u.id, type); }
}
