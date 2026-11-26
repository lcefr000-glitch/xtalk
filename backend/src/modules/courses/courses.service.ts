import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { UpsertCourseDto, UpsertLessonDto } from './dto/courses.dto';

@Injectable()
export class CoursesService implements OnModuleInit {
  private readonly log = new Logger('Courses');
  private ready = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
  ) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS courses (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          language_code TEXT NOT NULL,
          level TEXT NOT NULL,
          category TEXT,
          cover_emoji TEXT,
          published BOOLEAN NOT NULL DEFAULT true,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS lessons (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          duration_min INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons (course_id, position)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS course_enrollments (
          user_id TEXT NOT NULL,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ,
          PRIMARY KEY (user_id, course_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS lesson_progress (
          user_id TEXT NOT NULL,
          lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'STARTED',
          score INTEGER,
          bookmarked BOOLEAN NOT NULL DEFAULT false,
          completed_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, lesson_id)
        )`,
      );
      this.ready = true;
      this.log.log('courses tables ready');
    } catch (e) {
      this.log.error('courses bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Courses are not available right now');
  }

  // ---------- learner side ----------

  async list(userId: string, q: { language?: string; level?: string; search?: string; page: number; limit: number }) {
    this.ensureReady();
    const offset = (q.page - 1) * q.limit;
    const lang = q.language?.toLowerCase() ?? null;
    const level = q.level ?? null;
    const search = q.search ? `%${q.search}%` : null;
    const rows = await this.prisma.$queryRaw<
      {
        id: string; title: string; description: string | null; language_code: string; level: string;
        category: string | null; cover_emoji: string | null; lesson_count: bigint; enrolled: boolean; completed_count: bigint;
      }[]
    >`
      SELECT c.id, c.title, c.description, c.language_code, c.level, c.category, c.cover_emoji,
             (SELECT count(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
             EXISTS(SELECT 1 FROM course_enrollments e WHERE e.course_id = c.id AND e.user_id = ${userId}) AS enrolled,
             (SELECT count(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
              WHERE l.course_id = c.id AND lp.user_id = ${userId} AND lp.status = 'COMPLETED') AS completed_count
      FROM courses c
      WHERE c.published
        AND (${lang}::text IS NULL OR c.language_code = ${lang})
        AND (${level}::text IS NULL OR c.level = ${level})
        AND (${search}::text IS NULL OR c.title ILIKE ${search} OR c.description ILIKE ${search})
      ORDER BY c.created_at DESC LIMIT ${q.limit} OFFSET ${offset}`;
    return rows.map((r) => ({ ...r, lesson_count: Number(r.lesson_count), completed_count: Number(r.completed_count) }));
  }

  async detail(userId: string, courseId: string) {
    this.ensureReady();
    const courses = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM courses WHERE id = ${courseId} AND published`;
    if (!courses.length) throw new NotFoundException('Course not found');
    const lessons = await this.prisma.$queryRaw<
      {
        id: string; position: number; title: string; kind: string; duration_min: number | null;
        status: string | null; score: number | null; bookmarked: boolean | null;
      }[]
    >`
      SELECT l.id, l.position, l.title, l.kind, l.duration_min,
             lp.status, lp.score, lp.bookmarked
      FROM lessons l
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ${userId}
      WHERE l.course_id = ${courseId}
      ORDER BY l.position, l.created_at`;
    const enrollment = await this.prisma.$queryRaw<unknown[]>`
      SELECT * FROM course_enrollments WHERE user_id = ${userId} AND course_id = ${courseId}`;
    return { ...courses[0], lessons, enrolled: enrollment.length > 0, enrollment: enrollment[0] ?? null };
  }

  /** Full lesson content; enrollment required so progress belongs to the reader. */
  async lesson(userId: string, lessonId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT l.*, c.published AS course_published FROM lessons l JOIN courses c ON c.id = l.course_id
      WHERE l.id = ${lessonId}`;
    if (!rows.length || !rows[0].course_published) throw new NotFoundException('Lesson not found');
    // Touch progress so "lesson history" reflects what the learner opened.
    await this.prisma.$executeRaw`
      INSERT INTO lesson_progress (user_id, lesson_id) VALUES (${userId}, ${lessonId})
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET updated_at = now()`;
    const progress = await this.prisma.$queryRaw<unknown[]>`
      SELECT status, score, bookmarked, completed_at FROM lesson_progress WHERE user_id = ${userId} AND lesson_id = ${lessonId}`;
    return { ...rows[0], progress: progress[0] ?? null };
  }

  async enroll(userId: string, courseId: string) {
    this.ensureReady();
    const courses = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM courses WHERE id = ${courseId} AND published`;
    if (!courses.length) throw new NotFoundException('Course not found');
    await this.prisma.$executeRaw`
      INSERT INTO course_enrollments (user_id, course_id) VALUES (${userId}, ${courseId})
      ON CONFLICT (user_id, course_id) DO NOTHING`;
    return { success: true, enrolled: true };
  }

  async unenroll(userId: string, courseId: string) {
    this.ensureReady();
    await this.prisma.$executeRaw`DELETE FROM course_enrollments WHERE user_id = ${userId} AND course_id = ${courseId}`;
    return { success: true, enrolled: false };
  }

  async completeLesson(userId: string, lessonId: string, score?: number) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ id: string; course_id: string }[]>`
      SELECT l.id, l.course_id FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ${lessonId} AND c.published`;
    if (!rows.length) throw new NotFoundException('Lesson not found');
    await this.prisma.$executeRaw`
      INSERT INTO lesson_progress (user_id, lesson_id, status, score, completed_at)
      VALUES (${userId}, ${lessonId}, 'COMPLETED', ${score ?? null}, now())
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        status = 'COMPLETED', score = COALESCE(EXCLUDED.score, lesson_progress.score),
        completed_at = now(), updated_at = now()`;
    const newly = await this.progress.record(userId, { lessonsCompleted: 1 });
    // Mark the course completed when every lesson is done.
    const remaining = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT count(*) AS c FROM lessons l
      WHERE l.course_id = ${rows[0].course_id}
        AND NOT EXISTS (SELECT 1 FROM lesson_progress lp
                        WHERE lp.lesson_id = l.id AND lp.user_id = ${userId} AND lp.status = 'COMPLETED')`;
    if (Number(remaining[0]?.c ?? 1) === 0) {
      await this.prisma.$executeRaw`
        UPDATE course_enrollments SET completed_at = now() WHERE user_id = ${userId} AND course_id = ${rows[0].course_id} AND completed_at IS NULL`;
    }
    return { success: true, courseCompleted: Number(remaining[0]?.c ?? 1) === 0, newlyUnlocked: newly };
  }

  async toggleBookmark(userId: string, lessonId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM lessons WHERE id = ${lessonId}`;
    if (!rows.length) throw new NotFoundException('Lesson not found');
    await this.prisma.$executeRaw`
      INSERT INTO lesson_progress (user_id, lesson_id, bookmarked) VALUES (${userId}, ${lessonId}, true)
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET bookmarked = NOT lesson_progress.bookmarked, updated_at = now()`;
    const after = await this.prisma.$queryRaw<{ bookmarked: boolean }[]>`
      SELECT bookmarked FROM lesson_progress WHERE user_id = ${userId} AND lesson_id = ${lessonId}`;
    return { success: true, bookmarked: after[0]?.bookmarked ?? false };
  }

  async myEnrollments(userId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<
      { id: string; title: string; language_code: string; level: string; cover_emoji: string | null; enrolled_at: Date; completed_at: Date | null; lesson_count: bigint; completed_count: bigint }[]
    >`
      SELECT c.id, c.title, c.language_code, c.level, c.cover_emoji, e.enrolled_at, e.completed_at,
             (SELECT count(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
             (SELECT count(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
              WHERE l.course_id = c.id AND lp.user_id = ${userId} AND lp.status = 'COMPLETED') AS completed_count
      FROM course_enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.user_id = ${userId}
      ORDER BY e.enrolled_at DESC`;
    return rows.map((r) => ({ ...r, lesson_count: Number(r.lesson_count), completed_count: Number(r.completed_count) }));
  }

  async myBookmarks(userId: string) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT l.id, l.title, l.kind, l.course_id, c.title AS course_title, lp.updated_at AS bookmarked_at
      FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE lp.user_id = ${userId} AND lp.bookmarked
      ORDER BY lp.updated_at DESC`;
  }

  async myHistory(userId: string, limit: number) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT l.id, l.title, l.kind, l.course_id, c.title AS course_title, lp.status, lp.score, lp.updated_at
      FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE lp.user_id = ${userId}
      ORDER BY lp.updated_at DESC LIMIT ${limit}`;
  }

  // ---------- admin side ----------

  async upsertCourse(adminId: string, dto: UpsertCourseDto, courseId?: string) {
    this.ensureReady();
    if (courseId) {
      const n = await this.prisma.$executeRaw`
        UPDATE courses SET title = ${dto.title}, description = ${dto.description ?? null},
          language_code = ${dto.languageCode.toLowerCase()}, level = ${dto.level}, category = ${dto.category ?? null},
          cover_emoji = ${dto.coverEmoji ?? null}, published = COALESCE(${dto.published ?? null}, published), updated_at = now()
        WHERE id = ${courseId}`;
      if (!n) throw new NotFoundException('Course not found');
      return { id: courseId };
    }
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO courses (id, title, description, language_code, level, category, cover_emoji, published, created_by)
      VALUES (${id}, ${dto.title}, ${dto.description ?? null}, ${dto.languageCode.toLowerCase()}, ${dto.level},
        ${dto.category ?? null}, ${dto.coverEmoji ?? null}, ${dto.published ?? true}, ${adminId})`;
    return { id };
  }

  async deleteCourse(courseId: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`DELETE FROM courses WHERE id = ${courseId}`;
    if (!n) throw new NotFoundException('Course not found');
    return { success: true };
  }

  async upsertLesson(dto: UpsertLessonDto, courseId: string, lessonId?: string) {
    this.ensureReady();
    const courses = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM courses WHERE id = ${courseId}`;
    if (!courses.length) throw new NotFoundException('Course not found');
    if (lessonId) {
      const n = await this.prisma.$executeRaw`
        UPDATE lessons SET title = ${dto.title}, kind = ${dto.kind}, content = ${dto.content},
          position = ${dto.position}, duration_min = ${dto.durationMin ?? null}
        WHERE id = ${lessonId} AND course_id = ${courseId}`;
      if (!n) throw new NotFoundException('Lesson not found');
      return { id: lessonId };
    }
    const clash = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM lessons WHERE course_id = ${courseId} AND position = ${dto.position}`;
    if (clash.length) throw new ConflictException('A lesson already exists at this position');
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO lessons (id, course_id, position, title, kind, content, duration_min)
      VALUES (${id}, ${courseId}, ${dto.position}, ${dto.title}, ${dto.kind}, ${dto.content}, ${dto.durationMin ?? null})`;
    return { id };
  }

  async deleteLesson(courseId: string, lessonId: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`DELETE FROM lessons WHERE id = ${lessonId} AND course_id = ${courseId}`;
    if (!n) throw new NotFoundException('Lesson not found');
    return { success: true };
  }

  async adminList() {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<
      { id: string; title: string; language_code: string; level: string; published: boolean; created_at: Date; lesson_count: bigint; enrollment_count: bigint }[]
    >`
      SELECT c.id, c.title, c.language_code, c.level, c.published, c.created_at,
             (SELECT count(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
             (SELECT count(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollment_count
      FROM courses c ORDER BY c.created_at DESC`;
    return rows.map((r) => ({ ...r, lesson_count: Number(r.lesson_count), enrollment_count: Number(r.enrollment_count) }));
  }
}
