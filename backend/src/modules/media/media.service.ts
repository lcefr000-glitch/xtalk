import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mp4'];
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_BYTES = 6 * 1024 * 1024;

/** Check the real file signature so a non-image can't be stored under an image type. */
function sniffOk(mime: string, d: Buffer): boolean {
  if (mime === 'audio/mp4') return d.length > 12 && d.subarray(4, 8).toString('latin1') === 'ftyp';
  if (mime === 'image/jpeg') return d.length > 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff;
  if (mime === 'image/png') return d.length > 8 && d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/gif') { const h = d.subarray(0, 6).toString('latin1'); return h === 'GIF87a' || h === 'GIF89a'; }
  if (mime === 'image/webp') return d.length > 12 && d.subarray(0, 4).toString('latin1') === 'RIFF' && d.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

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
    if (!ALLOWED.includes(m)) throw new BadRequestException('Only JPEG, PNG, WEBP or GIF images or AAC voice clips are allowed');
    if (m === 'audio/mp4' && data.length > MAX_AUDIO_BYTES) throw new BadRequestException('Voice clip too large (max 2 MB)');
    if (!Buffer.isBuffer(data) || data.length === 0) throw new BadRequestException('Empty upload');
    if (data.length > MAX_BYTES) throw new BadRequestException('Image too large (max 6 MB)');
    if (!sniffOk(m, data)) throw new BadRequestException('File content does not match an image type');
    const q = await this.prisma.$queryRawUnsafe<{ n: number; b: number }[]>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(byte_size),0)::bigint::float8 AS b FROM media_files WHERE owner_id = $1 AND created_at > now() - interval '1 day'`, ownerId);
    if ((q[0]?.n ?? 0) >= 150 || (q[0]?.b ?? 0) > 150 * 1024 * 1024) throw new BadRequestException('Daily upload limit reached');
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
