import { ForbiddenException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from './admin.guard';
import { ModerationService } from '../moderation/moderation.service';

@ApiTags('admin')
@Public()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/moderation')
export class AdminModerationController {
  constructor(private readonly mod: ModerationService) {}

  /** Runs the real pre-send check for a user and text, without saving any message. Owner only. */
  @Post('test') async test(@Req() req: any, @Body() b: any) {
    if (req.admin.role !== 'SUPER_ADMIN') throw new ForbiddenException('Owner only');
    try { await this.mod.checkText(String(b.userId), (b.type ?? 'MESSAGE') as any, String(b.text ?? ''), String(b.target ?? 'test')); return { allowed: true }; }
    catch (e: any) { return { allowed: false, status: e?.getStatus?.() ?? 500, message: e?.message }; }
  }
  @Get('stats') stats() { return this.mod.stats(); }
  @Get('violations') violations(@Query() q: any) { return this.mod.violations({ user: q.user, status: q.status, risk: q.risk, limit: q.limit ? Number(q.limit) : undefined }); }
  @Get('queue') queue() { return this.mod.reviewQueue(); }
  @Get('reports') reports(@Query('status') s?: string) { return this.mod.reportsList(s); }
  @Post('violations/:id/decision') decideV(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.mod.decideViolation(req.admin.id, id, b.decision === 'OVERTURN' ? 'OVERTURN' : 'CONFIRM', b.note); }
  @Post('reports/:id/decision') decideR(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.mod.decideReport(req.admin.id, id, b.verdict === 'VALID' ? 'VALID' : 'INVALID', b.note); }
  @Get('penalties') penalties(@Query() q: any) { return this.mod.penalties({ user: q.user, active: q.active === undefined ? undefined : q.active === 'true' }); }
  @Post('penalties/:id/lift') lift(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.mod.liftPenalty(req.admin.id, id, b?.reason); }
  @Post('users/:id/penalty') manual(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.mod.manualPenalty(req.admin.id, req.admin.role, id, b.kind, b.hours ?? null, String(b.reason ?? '')); }
  @Get('appeals') appeals(@Query('status') s?: string) { return this.mod.appeals(s); }
  @Post('appeals/:id/decide') decideA(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.mod.decideAppeal(req.admin.id, id, !!b.accept, b.note); }
  @Get('users/search') search(@Query('q') q: string) { return this.mod.searchUsers(q ?? ''); }
  @Get('users/:id/history') history(@Param('id') id: string) { return this.mod.userHistory(id); }
  @Get('security-events') sec() { return this.mod.securityEvents(); }
}
