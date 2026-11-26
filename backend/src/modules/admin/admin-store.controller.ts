import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { StoreService } from '../store/store.service';
import { AdminGuard } from './admin.guard';

@ApiTags('admin')
@Public()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/store')
export class AdminStoreController {
  constructor(private readonly store: StoreService) {}

  @Get('settings')
  settings() {
    return this.store.settings();
  }

  @Put('settings')
  save(@Body() body: { contactUrl?: string; contactLabel?: string }) {
    return this.store.saveSettings(body ?? {});
  }

  @Get('catalog')
  catalog() {
    return this.store.catalog();
  }

  @Post('codes/batch')
  batch(@Req() req: any, @Body() body: { kind: string; coins?: number; vipTier?: string; count: number; expiresAt?: string; note?: string }) {
    return this.store.createBatch(req.admin.id, body);
  }

  @Get('codes')
  codes(@Query('batchId') batchId?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.store.listCodes({ batchId, status, page: page ? parseInt(page, 10) : 1, limit: limit ? parseInt(limit, 10) : 50 });
  }

  @Post('codes/:id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.store.revoke(id);
  }
}
