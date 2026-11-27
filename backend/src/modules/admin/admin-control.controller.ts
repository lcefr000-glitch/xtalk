import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlService } from '../control/control.service';
import { AdminGuard } from './admin.guard';

function owner(req: any) {
  if (req.admin?.role !== 'SUPER_ADMIN') throw new ForbiddenException('Owner (SUPER_ADMIN) only');
}

/** Emergency owner controls. All require a SUPER_ADMIN login. */
@Public()
@UseGuards(AdminGuard)
@Controller('admin/control')
export class AdminControlController {
  constructor(private readonly control: ControlService, private readonly prisma: PrismaService) {}

  private async audit(adminId: string, action: string, notes: string) {
    try {
      await this.prisma.moderationAction.create({ data: { adminId, action: 'WARN', targetId: adminId, notes: `${action}: ${notes}`.slice(0, 500) } });
    } catch { /* audit is best effort */ }
  }

  @Get()
  state(@Req() req: any) {
    owner(req);
    return this.control.state();
  }

  @Post('lockdown')
  async lockdown(@Req() req: any, @Body() b: { on: boolean; message?: string }) {
    owner(req);
    const s = await this.control.setLockdown(!!b?.on, b?.message);
    await this.audit(req.admin.id, 'LOCKDOWN', String(!!b?.on));
    return s;
  }

  @Post('min-version')
  async minVersion(@Req() req: any, @Body() b: { code?: number; message?: string; updateUrl?: string }) {
    owner(req);
    // each field is optional and changed only when sent
    if (typeof b?.message === 'string') await this.control.setLockdown((await this.control.state()).lockdown, b.message);
    if (typeof b?.updateUrl === 'string') {
      try { await this.control.setUpdateUrl(b.updateUrl); } catch (e) { throw new BadRequestException((e as Error).message); }
    }
    let s = await this.control.state();
    if (b?.code !== undefined) s = await this.control.setMinVersion(Number(b.code) || 0);
    await this.audit(req.admin.id, 'MIN_VERSION', JSON.stringify({ code: b?.code, updateUrl: b?.updateUrl, message: b?.message }).slice(0, 300));
    return s;
  }

  @Post('revoke-all')
  async revokeAll(@Req() req: any) {
    owner(req);
    const r = await this.control.revokeAll();
    await this.audit(req.admin.id, 'REVOKE_ALL', JSON.stringify(r));
    return { success: true, ...r };
  }

  @Get('admins')
  async admins(@Req() req: any) {
    owner(req);
    return this.prisma.adminUser.findMany({ select: { id: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'asc' } });
  }

  @Post('admins/:id/deactivate')
  async deactivate(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    owner(req);
    if (id === req.admin.id) throw new ForbiddenException('You cannot deactivate your own account');
    await this.prisma.adminUser.update({ where: { id }, data: { isActive: false } });
    await this.audit(req.admin.id, 'ADMIN_DEACTIVATE', id);
    return { success: true };
  }
}
