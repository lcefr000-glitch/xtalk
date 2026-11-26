import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 6 * 1024 * 1024;

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly log = new Logger('Media');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS media_files (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_id TEXT NOT NULL,
          mime TEXT NOT NULL,
          data BYTEA NOT NULL,
          byte_size INT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS post_views (
          post_id TEXT NOT NULL, viewer_id TEXT NOT NULL, viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (post_id, viewer_id)
        )`,
      );
    } catch (e) {
      this.log.error(`media bootstrap failed: ${(e as Error).message}`);
    }
  }

  async save(ownerId: string, mime: string, data: Buffer) {
    const m = (mime || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED.includes(m)) throw new BadRequestException('Only JPEG, PNG, WEBP or GIF images are allowed');
    if (!Buffer.isBuffer(data) || data.length === 0) throw new BadRequestException('Empty upload');
    if (data.length > MAX_BYTES) throw new BadRequestException('Image too large (max 6 MB)');
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO media_files (owner_id, mime, data, byte_size) VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
      ownerId, m, data, data.length,
    );
    return { id: rows[0].id, mimeType: m, byteSize: data.length };
  }

  async get(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ mime: string; data: Buffer }[]>(
      `SELECT mime, data FROM media_files WHERE id = $1::uuid`, id,
    );
    if (!rows.length) throw new NotFoundException();
    return rows[0];
  }

  /** Records one view per viewer per post (own posts excluded) and returns total counts. */
  async recordViews(viewerId: string, ids: string[]) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const clean = [...new Set(ids)].filter((i) => uuid.test(i)).slice(0, 50);
    if (!clean.length) return { counts: {} as Record<string, number> };
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO post_views (post_id, viewer_id)
         SELECT p.id, $1 FROM "Post" p WHERE p.id = ANY($2::text[]) AND p."authorId" <> $1 AND p."deletedAt" IS NULL
         ON CONFLICT DO NOTHING`,
        viewerId, clean,
      );
    } catch (e) {
      this.log.warn(`record views failed: ${(e as Error).message}`);
    }
    const rows = await this.prisma.$queryRawUnsafe<{ post_id: string; n: number }[]>(
      `SELECT post_id, count(*)::int AS n FROM post_views WHERE post_id = ANY($1::text[]) GROUP BY post_id`, clean,
    );
    const counts: Record<string, number> = {};
    for (const id of clean) counts[id] = 0;
    for (const r of rows) counts[r.post_id] = r.n;
    return { counts };
  }
}
