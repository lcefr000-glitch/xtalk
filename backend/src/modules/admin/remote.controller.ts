import { Body, Controller, Delete, Get, NotFoundException, Param, Put, Post, Query, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from './admin.guard';
import { RemoteService } from './remote.service';

/** Public: what the app reads at launch (banner, flags, newest build) and the images of custom shop items. */
@Public()
@Controller('app')
export class AppRemoteController {
  constructor(private readonly remote: RemoteService) {}

  @Public() @Get('config')
  async config() {
    const c = await this.remote.config();
    const { latest_version_code, apk_url, ...rest } = c;
    return { latestVersionCode: parseInt(latest_version_code ?? '0', 10) || 0, apkUrl: apk_url ?? '', values: rest };
  }

  @Public() @Get('shop-img/:id')
  async img(@Param('id') id: string, @Res() res: any) {
    const r = await this.remote.image(id);
    if (!r) throw new NotFoundException();
    res.set({ 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=86400' });
    res.send(r.img);
  }
}

@Public()
@UseGuards(AdminGuard)
@Controller('admin/remote')
export class AdminRemoteController {
  constructor(private readonly remote: RemoteService) {}

  @Get('config') config() { return this.remote.config(); }
  @Put('config') save(@Body() b: { values?: Record<string, string> }) { return this.remote.saveConfig(b?.values ?? {}); }
  @Get('items') items() { return this.remote.listItems(); }
  @Delete('items/:id') del(@Param('id') id: string) { return this.remote.removeItem(id); }

  /** Image bytes in the body, the rest in the query. */
  @Post('items')
  add(@Req() req: any, @Query() q: { kind?: string; name?: string; nameAr?: string; price7?: string; price30?: string }) {
    if (!Buffer.isBuffer(req.body)) throw new BadRequestException('Send the image as the request body');
    return this.remote.addItem({ kind: String(q.kind ?? ''), name: String(q.name ?? ''), nameAr: String(q.nameAr ?? ''), price7: parseInt(q.price7 ?? '0', 10), price30: parseInt(q.price30 ?? '0', 10), mime: String(req.headers['content-type'] ?? ''), img: req.body });
  }
}
