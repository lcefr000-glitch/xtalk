import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MediaService } from './media.service';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Raw image bytes in the body, Content-Type = the image mime type. */
  @Post('media')
  async upload(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const saved = await this.media.save(user.id, req.headers['content-type'] ?? '', req.body as Buffer);
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
    const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.get('host');
    return { ...saved, url: `${proto}://${host}/api/v1/media/${saved.id}` };
  }

  /** Public by unguessable id so image loaders need no auth header. */
  @Public()
  @Get('media/:id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const f = await this.media.get(id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.end(f.data);
  }

  @Post('post-views')
  views(@CurrentUser() user: AuthUser, @Body() body: { ids?: string[] }) {
    return this.media.recordViews(user.id, Array.isArray(body?.ids) ? body.ids.filter((i) => typeof i === 'string') : []);
  }
}
