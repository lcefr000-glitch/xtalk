import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilitySlotDto, UpsertTeacherProfileDto } from './dto/teachers.dto';

const BOOKING_STATUSES = ['REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELED', 'COMPLETED'] as const;

@Injectable()
export class TeachersService implements OnModuleInit {
  private readonly log = new Logger('Teachers');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS teacher_profiles (
          user_id TEXT PRIMARY KEY,
          bio TEXT NOT NULL,
          teaching_languages TEXT[] NOT NULL DEFAULT '{}',
          qualifications TEXT,
          experience_years INTEGER,
          hourly_rate_cents INTEGER NOT NULL DEFAULT 0,
          verified BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS teacher_availability (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL REFERENCES teacher_profiles(user_id) ON DELETE CASCADE,
          weekday INTEGER NOT NULL,
          start_minute INTEGER NOT NULL,
          end_minute INTEGER NOT NULL
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS teacher_availability_teacher_idx ON teacher_availability (teacher_id)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS lesson_bookings (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          starts_at TIMESTAMPTZ NOT NULL,
          duration_min INTEGER NOT NULL,
          price_cents INTEGER NOT NULL DEFAULT 0,
          note TEXT,
          status TEXT NOT NULL DEFAULT 'REQUESTED',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS lesson_bookings_teacher_idx ON lesson_bookings (teacher_id, starts_at)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS lesson_bookings_student_idx ON lesson_bookings (student_id, starts_at)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS teacher_reviews (
          id TEXT PRIMARY KEY,
          teacher_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          booking_id TEXT NOT NULL UNIQUE,
          rating INTEGER NOT NULL,
          feedback TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS teacher_reviews_teacher_idx ON teacher_reviews (teacher_id)`,
      );
      this.ready = true;
      this.log.log('teacher tables ready');
    } catch (e) {
      this.log.error('teachers bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Teachers are not available right now');
  }

  // ---------- teacher profile ----------

  async upsertProfile(userId: string, dto: UpsertTeacherProfileDto) {
    this.ensureReady();
    const langs = dto.teachingLanguages.map((l) => l.toLowerCase());
    await this.prisma.$executeRaw`
      INSERT INTO teacher_profiles (user_id, bio, teaching_languages, qualifications, experience_years, hourly_rate_cents)
      VALUES (${userId}, ${dto.bio}, ${langs}, ${dto.qualifications ?? null}, ${dto.experienceYears ?? null}, ${dto.hourlyRateCents})
      ON CONFLICT (user_id) DO UPDATE SET
        bio = EXCLUDED.bio, teaching_languages = EXCLUDED.teaching_languages,
        qualifications = EXCLUDED.qualifications, experience_years = EXCLUDED.experience_years,
        hourly_rate_cents = EXCLUDED.hourly_rate_cents, updated_at = now()`;
    if (dto.availability) await this.setAvailability(userId, dto.availability);
    return this.profile(userId);
  }

  async setAvailability(userId: string, slots: AvailabilitySlotDto[]) {
    for (const s of slots) {
      if (s.endMinute <= s.startMinute) throw new BadRequestException('Availability end must be after start');
    }
    await this.prisma.$executeRaw`DELETE FROM teacher_availability WHERE teacher_id = ${userId}`;
    for (const s of slots) {
      await this.prisma.$executeRaw`
        INSERT INTO teacher_availability (id, teacher_id, weekday, start_minute, end_minute)
        VALUES (${crypto.randomUUID()}, ${userId}, ${s.weekday}, ${s.startMinute}, ${s.endMinute})`;
    }
    return { success: true, slots: slots.length };
  }

  async profile(teacherId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT t.*, u.username, u.status AS user_status, p."displayName", p."photoUrl", p.country,
             COALESCE((SELECT avg(r.rating) FROM teacher_reviews r WHERE r.teacher_id = t.user_id), 0) AS avg_rating,
             (SELECT count(*) FROM teacher_reviews r WHERE r.teacher_id = t.user_id) AS review_count
      FROM teacher_profiles t
      JOIN "User" u ON u.id = t.user_id
      LEFT JOIN "Profile" p ON p."userId" = t.user_id
      WHERE t.user_id = ${teacherId}`;
    if (!rows.length) throw new NotFoundException('Teacher not found');
    const availability = await this.prisma.$queryRaw<unknown[]>`
      SELECT weekday, start_minute, end_minute FROM teacher_availability WHERE teacher_id = ${teacherId} ORDER BY weekday, start_minute`;
    const r = rows[0];
    return { ...r, avg_rating: Number(r.avg_rating), review_count: Number(r.review_count), availability };
  }

  async search(q: { language?: string; verifiedOnly?: boolean; page: number; limit: number }) {
    this.ensureReady();
    const offset = (q.page - 1) * q.limit;
    const lang = q.language?.toLowerCase() ?? null;
    const verified = q.verifiedOnly ?? false;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT t.user_id, t.teaching_languages, t.experience_years, t.hourly_rate_cents, t.verified,
             u.username, p."displayName", p."photoUrl", p.country,
             COALESCE((SELECT avg(r.rating) FROM teacher_reviews r WHERE r.teacher_id = t.user_id), 0) AS avg_rating,
             (SELECT count(*) FROM teacher_reviews r WHERE r.teacher_id = t.user_id) AS review_count
      FROM teacher_profiles t
      JOIN "User" u ON u.id = t.user_id AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL
      LEFT JOIN "Profile" p ON p."userId" = t.user_id
      WHERE (${lang}::text IS NULL OR ${lang} = ANY(t.teaching_languages))
        AND (${verified}::boolean = false OR t.verified)
      ORDER BY t.verified DESC, avg_rating DESC
      LIMIT ${q.limit} OFFSET ${offset}`;
    return rows.map((r) => ({ ...r, avg_rating: Number(r.avg_rating), review_count: Number(r.review_count) }));
  }

  async reviews(teacherId: string, page: number, limit: number) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT r.id, r.rating, r.feedback, r.created_at, u.username, p."displayName", p."photoUrl"
      FROM teacher_reviews r
      JOIN "User" u ON u.id = r.student_id
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE r.teacher_id = ${teacherId}
      ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  }

  // ---------- bookings ----------

  async book(studentId: string, teacherId: string, startsAt: Date, durationMin: number, note?: string) {
    this.ensureReady();
    if (studentId === teacherId) throw new BadRequestException('Cannot book a lesson with yourself');
    if (startsAt.getTime() < Date.now() + 30 * 60_000) throw new BadRequestException('Lessons must be booked at least 30 minutes ahead');
    if (startsAt.getTime() > Date.now() + 60 * 86_400_000) throw new BadRequestException('Lessons can be booked at most 60 days ahead');
    const teacher = await this.prisma.$queryRaw<{ user_id: string; hourly_rate_cents: number }[]>`
      SELECT user_id, hourly_rate_cents FROM teacher_profiles WHERE user_id = ${teacherId}`;
    if (!teacher.length) throw new NotFoundException('Teacher not found');
    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: studentId, blockedId: teacherId }, { blockerId: teacherId, blockedId: studentId }] },
    });
    if (blocked) throw new ForbiddenException('Cannot book this teacher');
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    const clash = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM lesson_bookings
      WHERE teacher_id = ${teacherId} AND status IN ('REQUESTED', 'CONFIRMED')
        AND starts_at < ${endsAt} AND starts_at + make_interval(mins => duration_min) > ${startsAt}`;
    if (clash.length) throw new ConflictException('This slot overlaps another booking');
    const priceCents = Math.round((teacher[0].hourly_rate_cents * durationMin) / 60);
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO lesson_bookings (id, teacher_id, student_id, starts_at, duration_min, price_cents, note)
      VALUES (${id}, ${teacherId}, ${studentId}, ${startsAt}, ${durationMin}, ${priceCents}, ${note ?? null})`;
    await this.prisma.notification
      .create({ data: { recipientId: teacherId, actorId: studentId, type: 'ACCOUNT', payload: { kind: 'booking_request', bookingId: id } } })
      .catch(() => undefined);
    return { id, status: 'REQUESTED', priceCents };
  }

  private async bookingOf(id: string) {
    const rows = await this.prisma.$queryRaw<
      { id: string; teacher_id: string; student_id: string; status: string; starts_at: Date }[]
    >`SELECT id, teacher_id, student_id, status, starts_at FROM lesson_bookings WHERE id = ${id}`;
    if (!rows.length) throw new NotFoundException('Booking not found');
    return rows[0];
  }

  private async setStatus(id: string, from: string[], to: string) {
    const n = await this.prisma.$executeRaw`
      UPDATE lesson_bookings SET status = ${to}, updated_at = now()
      WHERE id = ${id} AND status IN (${Prisma.join(from)})`;
    if (!n) throw new ConflictException(`Booking cannot move to ${to} from its current state`);
  }

  async confirm(userId: string, bookingId: string) {
    this.ensureReady();
    const b = await this.bookingOf(bookingId);
    if (b.teacher_id !== userId) throw new ForbiddenException('Only the teacher can confirm');
    await this.setStatus(bookingId, ['REQUESTED'], 'CONFIRMED');
    await this.prisma.notification
      .create({ data: { recipientId: b.student_id, actorId: userId, type: 'ACCOUNT', payload: { kind: 'booking_confirmed', bookingId } } })
      .catch(() => undefined);
    return { success: true, status: 'CONFIRMED' };
  }

  async decline(userId: string, bookingId: string) {
    this.ensureReady();
    const b = await this.bookingOf(bookingId);
    if (b.teacher_id !== userId) throw new ForbiddenException('Only the teacher can decline');
    await this.setStatus(bookingId, ['REQUESTED'], 'DECLINED');
    return { success: true, status: 'DECLINED' };
  }

  async cancel(userId: string, bookingId: string) {
    this.ensureReady();
    const b = await this.bookingOf(bookingId);
    if (b.teacher_id !== userId && b.student_id !== userId) throw new ForbiddenException('Not your booking');
    if (new Date(b.starts_at).getTime() < Date.now()) throw new BadRequestException('Cannot cancel a past lesson');
    await this.setStatus(bookingId, ['REQUESTED', 'CONFIRMED'], 'CANCELED');
    return { success: true, status: 'CANCELED' };
  }

  async complete(userId: string, bookingId: string) {
    this.ensureReady();
    const b = await this.bookingOf(bookingId);
    if (b.teacher_id !== userId && b.student_id !== userId) throw new ForbiddenException('Not your booking');
    await this.setStatus(bookingId, ['CONFIRMED'], 'COMPLETED');
    return { success: true, status: 'COMPLETED' };
  }

  async myBookings(userId: string, role: 'student' | 'teacher') {
    this.ensureReady();
    const col = role === 'student' ? 'student_id' : 'teacher_id';
    return this.prisma.$queryRawUnsafe(
      `SELECT b.*, u.username AS other_username, p."displayName" AS other_display_name, p."photoUrl" AS other_photo_url,
              EXISTS(SELECT 1 FROM teacher_reviews r WHERE r.booking_id = b.id) AS reviewed
       FROM lesson_bookings b
       JOIN "User" u ON u.id = CASE WHEN $1 = 'student' THEN b.teacher_id ELSE b.student_id END
       LEFT JOIN "Profile" p ON p."userId" = u.id
       WHERE b.${col} = $2
       ORDER BY b.starts_at DESC LIMIT 100`,
      role, userId,
    );
  }

  async review(studentId: string, bookingId: string, rating: number, feedback?: string) {
    this.ensureReady();
    const b = await this.bookingOf(bookingId);
    if (b.student_id !== studentId) throw new ForbiddenException('Only the student can review');
    if (b.status !== 'COMPLETED') throw new BadRequestException('Only completed lessons can be reviewed');
    const id = crypto.randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO teacher_reviews (id, teacher_id, student_id, booking_id, rating, feedback)
        VALUES (${id}, ${b.teacher_id}, ${studentId}, ${bookingId}, ${rating}, ${feedback ?? null})`;
    } catch {
      throw new ConflictException('This lesson was already reviewed');
    }
    return { id, success: true };
  }

  // ---------- admin ----------

  async setVerified(teacherId: string, verified: boolean) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`UPDATE teacher_profiles SET verified = ${verified}, updated_at = now() WHERE user_id = ${teacherId}`;
    if (!n) throw new NotFoundException('Teacher not found');
    return { success: true, verified };
  }

  async adminList() {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ user_id: string; verified: boolean; hourly_rate_cents: number; teaching_languages: string[]; created_at: Date; username: string; status: string; displayName: string | null; booking_count: bigint }[]>`
      SELECT t.user_id, t.verified, t.hourly_rate_cents, t.teaching_languages, t.created_at,
             u.username, u.status, p."displayName",
             (SELECT count(*) FROM lesson_bookings b WHERE b.teacher_id = t.user_id) AS booking_count
      FROM teacher_profiles t JOIN "User" u ON u.id = t.user_id LEFT JOIN "Profile" p ON p."userId" = t.user_id
      ORDER BY t.created_at DESC`;
    return rows.map((r) => ({ ...r, booking_count: Number(r.booking_count) }));
  }
}

export { BOOKING_STATUSES };
