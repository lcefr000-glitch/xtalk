import { Body, Controller, Get, Header, UnauthorizedException, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminLoginDto, ResolveReportDto } from './dto/admin.dto';
import { AdminGuard, adminIpAllowed } from './admin.guard';
import { ADMIN_PANEL_HTML } from './admin-panel.html';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Public() // global user-JWT guard skips these; AdminGuard authenticates instead
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Public()
  @Get('panel')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
  @Header('X-Robots-Tag', 'noindex')
  panel() {
    return ADMIN_PANEL_HTML;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  login(@Body() dto: AdminLoginDto, @Req() req: any) {
    if (!adminIpAllowed(req.ip)) throw new UnauthorizedException('Not allowed from this network');
    return this.admin.login(dto.email, dto.password);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('users')
  users(@Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.searchUsers(search, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('users/:id/suspend')
  suspend(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { notes?: string }) {
    return this.admin.setUserStatus(req.admin.id, id, 'SUSPENDED', body?.notes);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('users/:id/unsuspend')
  unsuspend(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { notes?: string }) {
    return this.admin.setUserStatus(req.admin.id, id, 'ACTIVE', body?.notes);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('users/:id/restrict')
  restrict(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: { notes?: string }) {
    return this.admin.setUserStatus(req.admin.id, id, 'RESTRICTED', body?.notes);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('reports')
  reports(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.reports(status, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('reports/:id/resolve')
  resolve(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveReportDto) {
    return this.admin.resolveReport(req.admin.id, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('users/:id/restore-preview')
  restorePreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.restorePreview(id);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('users/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.admin.restoreDeleted(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('audit-log')
  audit(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.auditLog(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 30);
  }
}
