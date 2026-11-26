import { Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { SaveItemDto, UpdateItemDto } from './dto/vocabulary.dto';

/**
 * SM-2 (lite) spaced repetition: quality < 3 resets the streak; otherwise the
 * interval grows 1 -> 3 -> ceil(prev * ease) days. Ease floor 1.3.
 */
export function sm2(quality: number, ease: number, intervalDays: number, repetitions: number) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let e = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  e = Math.max(1.3, e);
  if (q < 3) return { ease: e, intervalDays: 0, repetitions: 0 };
  const reps = repetitions + 1;
  const interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.ceil(intervalDays * e);
  return { ease: e, intervalDays: interval, repetitions: reps };
}

@Injectable()
export class VocabularyService implements OnModuleInit {
  private readonly log = new Logger('Vocabulary');
  private ready = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
  ) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS vocab_collections (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          language_code TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS vocab_collections_user_idx ON vocab_collections (user_id)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS vocab_items (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          collection_id TEXT,
          term TEXT NOT NULL,
          language_code TEXT NOT NULL,
          translation TEXT,
          translation_language_code TEXT,
          definition TEXT,
          example TEXT,
          pronunciation TEXT,
          kind TEXT NOT NULL DEFAULT 'WORD',
          source_message_id TEXT,
          ease REAL NOT NULL DEFAULT 2.5,
          interval_days INTEGER NOT NULL DEFAULT 0,
          repetitions INTEGER NOT NULL DEFAULT 0,
          due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS vocab_items_user_idx ON vocab_items (user_id, language_code)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS vocab_items_due_idx ON vocab_items (user_id, due_at)`,
      );
      this.ready = true;
      this.log.log('vocabulary tables ready');
    } catch (e) {
      this.log.error('vocabulary bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Vocabulary is not available right now');
  }

  // ---------- collections ----------

  async collections(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; language_code: string; created_at: Date; item_count: bigint }[]
    >`
      SELECT c.id, c.name, c.language_code, c.created_at,
             (SELECT count(*) FROM vocab_items i WHERE i.collection_id = c.id) AS item_count
      FROM vocab_collections c WHERE c.user_id = ${userId}
      ORDER BY c.created_at DESC`;
    return rows.map((r) => ({ ...r, item_count: Number(r.item_count) }));
  }

  async createCollection(userId: string, name: string, languageCode: string) {
    this.ensureReady();
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO vocab_collections (id, user_id, name, language_code) VALUES (${id}, ${userId}, ${name}, ${languageCode.toLowerCase()})`;
    return { id, name, languageCode: languageCode.toLowerCase(), item_count: 0 };
  }

  async deleteCollection(userId: string, id: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`DELETE FROM vocab_collections WHERE id = ${id} AND user_id = ${userId}`;
    if (!n) throw new NotFoundException('Collection not found');
    await this.prisma.$executeRaw`UPDATE vocab_items SET collection_id = NULL WHERE collection_id = ${id} AND user_id = ${userId}`;
    return { success: true };
  }

  // ---------- items ----------

  async save(userId: string, dto: SaveItemDto) {
    this.ensureReady();
    if (dto.collectionId) {
      const own = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM vocab_collections WHERE id = ${dto.collectionId} AND user_id = ${userId}`;
      if (!own.length) throw new NotFoundException('Collection not found');
    }
    const id = crypto.randomUUID();
    const kind = dto.kind ?? (dto.term.trim().includes(' ') ? 'EXPRESSION' : 'WORD');
    await this.prisma.$executeRaw`
      INSERT INTO vocab_items (id, user_id, collection_id, term, language_code, translation, translation_language_code,
        definition, example, pronunciation, kind, source_message_id)
      VALUES (${id}, ${userId}, ${dto.collectionId ?? null}, ${dto.term.trim()}, ${dto.languageCode.toLowerCase()},
        ${dto.translation ?? null}, ${dto.translationLanguageCode?.toLowerCase() ?? null},
        ${dto.definition ?? null}, ${dto.example ?? null}, ${dto.pronunciation ?? null}, ${kind}, ${dto.sourceMessageId ?? null})`;
    await this.progress.record(userId, { wordsSaved: 1 });
    const rows = await this.prisma.$queryRaw<unknown[]>`SELECT * FROM vocab_items WHERE id = ${id}`;
    return rows[0];
  }

  async list(userId: string, q: { language?: string; collectionId?: string; search?: string; page: number; limit: number }) {
    this.ensureReady();
    const offset = (q.page - 1) * q.limit;
    const lang = q.language?.toLowerCase() ?? null;
    const coll = q.collectionId ?? null;
    const search = q.search ? `%${q.search}%` : null;
    const rows = await this.prisma.$queryRaw<unknown[]>`
      SELECT * FROM vocab_items
      WHERE user_id = ${userId}
        AND (${lang}::text IS NULL OR language_code = ${lang})
        AND (${coll}::text IS NULL OR collection_id = ${coll})
        AND (${search}::text IS NULL OR term ILIKE ${search} OR translation ILIKE ${search} OR definition ILIKE ${search})
      ORDER BY created_at DESC LIMIT ${q.limit} OFFSET ${offset}`;
    const total = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT count(*) AS c FROM vocab_items
      WHERE user_id = ${userId}
        AND (${lang}::text IS NULL OR language_code = ${lang})
        AND (${coll}::text IS NULL OR collection_id = ${coll})
        AND (${search}::text IS NULL OR term ILIKE ${search} OR translation ILIKE ${search} OR definition ILIKE ${search})`;
    return { items: rows, total: Number(total[0]?.c ?? 0), page: q.page, limit: q.limit };
  }

  private async owned(userId: string, id: string) {
    const rows = await this.prisma.$queryRaw<
      { id: string; ease: number; interval_days: number; repetitions: number }[]
    >`SELECT id, ease, interval_days, repetitions FROM vocab_items WHERE id = ${id} AND user_id = ${userId}`;
    if (!rows.length) throw new NotFoundException('Word not found');
    return rows[0];
  }

  async update(userId: string, id: string, dto: UpdateItemDto) {
    this.ensureReady();
    await this.owned(userId, id);
    if (dto.collectionId) {
      const own = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM vocab_collections WHERE id = ${dto.collectionId} AND user_id = ${userId}`;
      if (!own.length) throw new NotFoundException('Collection not found');
    }
    await this.prisma.$executeRaw`
      UPDATE vocab_items SET
        translation = COALESCE(${dto.translation ?? null}, translation),
        definition = COALESCE(${dto.definition ?? null}, definition),
        example = COALESCE(${dto.example ?? null}, example),
        pronunciation = COALESCE(${dto.pronunciation ?? null}, pronunciation),
        collection_id = COALESCE(${dto.collectionId ?? null}, collection_id)
      WHERE id = ${id} AND user_id = ${userId}`;
    const rows = await this.prisma.$queryRaw<unknown[]>`SELECT * FROM vocab_items WHERE id = ${id}`;
    return rows[0];
  }

  async remove(userId: string, id: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`DELETE FROM vocab_items WHERE id = ${id} AND user_id = ${userId}`;
    if (!n) throw new NotFoundException('Word not found');
    return { success: true };
  }

  // ---------- review / flashcards ----------

  async due(userId: string, limit: number, language?: string) {
    this.ensureReady();
    const lang = language?.toLowerCase() ?? null;
    const rows = await this.prisma.$queryRaw<unknown[]>`
      SELECT * FROM vocab_items
      WHERE user_id = ${userId} AND due_at <= now()
        AND (${lang}::text IS NULL OR language_code = ${lang})
      ORDER BY due_at LIMIT ${limit}`;
    return rows;
  }

  async review(userId: string, id: string, quality: number) {
    this.ensureReady();
    const item = await this.owned(userId, id);
    const next = sm2(quality, Number(item.ease), item.interval_days, item.repetitions);
    await this.prisma.$executeRaw`
      UPDATE vocab_items SET
        ease = ${next.ease},
        interval_days = ${next.intervalDays},
        repetitions = ${next.repetitions},
        due_at = now() + make_interval(days => ${next.intervalDays}::int),
        last_reviewed_at = now()
      WHERE id = ${id} AND user_id = ${userId}`;
    await this.progress.record(userId, { reviewsDone: 1 });
    return { success: true, ...next };
  }

  /** Multiple-choice quiz: due or recent items, each with 3 distractors from the same language. */
  async quiz(userId: string, language: string | undefined, count: number) {
    this.ensureReady();
    const lang = language?.toLowerCase() ?? null;
    const items = await this.prisma.$queryRaw<{ id: string; term: string; translation: string | null; language_code: string }[]>`
      SELECT id, term, translation, language_code FROM vocab_items
      WHERE user_id = ${userId} AND translation IS NOT NULL
        AND (${lang}::text IS NULL OR language_code = ${lang})
      ORDER BY due_at LIMIT ${count}`;
    const questions = [] as { id: string; term: string; answer: string; options: string[] }[];
    for (const it of items) {
      const distractors = await this.prisma.$queryRaw<{ translation: string }[]>`
        SELECT translation FROM (
          SELECT DISTINCT translation FROM vocab_items
          WHERE user_id = ${userId} AND translation IS NOT NULL AND id <> ${it.id} AND language_code = ${it.language_code}
        ) d ORDER BY random() LIMIT 3`;
      const options = [it.translation as string, ...distractors.map((d) => d.translation)];
      // Fisher-Yates shuffle
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      questions.push({ id: it.id, term: it.term, answer: it.translation as string, options });
    }
    return { questions };
  }

  async stats(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<
      { language_code: string; total: bigint; mastered: bigint; due: bigint }[]
    >`
      SELECT language_code,
             count(*) AS total,
             count(*) FILTER (WHERE interval_days >= 21) AS mastered,
             count(*) FILTER (WHERE due_at <= now()) AS due
      FROM vocab_items WHERE user_id = ${userId}
      GROUP BY language_code ORDER BY total DESC`;
    return rows.map((r) => ({
      languageCode: r.language_code,
      total: Number(r.total),
      mastered: Number(r.mastered),
      due: Number(r.due),
    }));
  }
}
