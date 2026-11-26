import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ActivityDelta {
  practiceSeconds?: number;
  wordsSaved?: number;
  messagesSent?: number;
  lessonsCompleted?: number;
  reviewsDone?: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Predicate over the user's all-time totals. */
  test: (t: Totals, streak: number) => boolean;
}

export interface Totals {
  practiceSeconds: number;
  wordsSaved: number;
  messagesSent: number;
  lessonsCompleted: number;
  reviewsDone: number;
  activeDays: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-word', name: 'First word', description: 'Save your first word', emoji: '🌱', test: (t) => t.wordsSaved >= 1 },
  { id: 'word-collector', name: 'Word collector', description: 'Save 25 words', emoji: '📚', test: (t) => t.wordsSaved >= 25 },
  { id: 'word-master', name: 'Word master', description: 'Save 100 words', emoji: '🏆', test: (t) => t.wordsSaved >= 100 },
  { id: 'reviewer-10', name: 'Reviewer', description: 'Complete 10 flashcard reviews', emoji: '🔁', test: (t) => t.reviewsDone >= 10 },
  { id: 'reviewer-100', name: 'Review machine', description: 'Complete 100 flashcard reviews', emoji: '⚡', test: (t) => t.reviewsDone >= 100 },
  { id: 'streak-3', name: 'Warming up', description: 'Reach a 3-day streak', emoji: '🔥', test: (_t, s) => s >= 3 },
  { id: 'streak-7', name: 'On fire', description: 'Reach a 7-day streak', emoji: '🔥', test: (_t, s) => s >= 7 },
  { id: 'streak-30', name: 'Unstoppable', description: 'Reach a 30-day streak', emoji: '💎', test: (_t, s) => s >= 30 },
  { id: 'lesson-1', name: 'First lesson', description: 'Complete your first lesson', emoji: '🎓', test: (t) => t.lessonsCompleted >= 1 },
  { id: 'lesson-10', name: 'Student', description: 'Complete 10 lessons', emoji: '📖', test: (t) => t.lessonsCompleted >= 10 },
  { id: 'chatter-50', name: 'Conversationalist', description: 'Send 50 messages', emoji: '💬', test: (t) => t.messagesSent >= 50 },
  { id: 'marathon-60', name: 'Marathon', description: 'Practice for 60 minutes in total', emoji: '⏱️', test: (t) => t.practiceSeconds >= 3600 },
];

@Injectable()
export class ProgressService implements OnModuleInit {
  private readonly log = new Logger('Progress');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS user_activity_daily (
          user_id TEXT NOT NULL,
          day DATE NOT NULL,
          practice_seconds INTEGER NOT NULL DEFAULT 0,
          words_saved INTEGER NOT NULL DEFAULT 0,
          messages_sent INTEGER NOT NULL DEFAULT 0,
          lessons_completed INTEGER NOT NULL DEFAULT 0,
          reviews_done INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, day)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS user_achievements (
          user_id TEXT NOT NULL,
          achievement_id TEXT NOT NULL,
          unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, achievement_id)
        )`,
      );
      this.ready = true;
      this.log.log('progress tables ready');
    } catch (e) {
      this.log.error('progress bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Progress tracking is not available right now');
  }

  /** Record activity for today (UTC). Called by other modules and by POST /progress/activity. */
  async record(userId: string, delta: ActivityDelta): Promise<string[]> {
    if (!this.ready) return [];
    const practice = Math.max(0, Math.min(86_400, Math.floor(delta.practiceSeconds ?? 0)));
    const words = Math.max(0, Math.min(10_000, Math.floor(delta.wordsSaved ?? 0)));
    const messages = Math.max(0, Math.min(100_000, Math.floor(delta.messagesSent ?? 0)));
    const lessons = Math.max(0, Math.min(1_000, Math.floor(delta.lessonsCompleted ?? 0)));
    const reviews = Math.max(0, Math.min(100_000, Math.floor(delta.reviewsDone ?? 0)));
    if (practice + words + messages + lessons + reviews === 0) return [];
    await this.prisma.$executeRaw`
      INSERT INTO user_activity_daily (user_id, day, practice_seconds, words_saved, messages_sent, lessons_completed, reviews_done)
      VALUES (${userId}, CURRENT_DATE, ${practice}, ${words}, ${messages}, ${lessons}, ${reviews})
      ON CONFLICT (user_id, day) DO UPDATE SET
        practice_seconds = user_activity_daily.practice_seconds + EXCLUDED.practice_seconds,
        words_saved = user_activity_daily.words_saved + EXCLUDED.words_saved,
        messages_sent = user_activity_daily.messages_sent + EXCLUDED.messages_sent,
        lessons_completed = user_activity_daily.lessons_completed + EXCLUDED.lessons_completed,
        reviews_done = user_activity_daily.reviews_done + EXCLUDED.reviews_done`;
    return this.checkAchievements(userId);
  }

  async totals(userId: string): Promise<Totals> {
    const rows = await this.prisma.$queryRaw<
      { practice_seconds: bigint; words_saved: bigint; messages_sent: bigint; lessons_completed: bigint; reviews_done: bigint; active_days: bigint }[]
    >`
      SELECT COALESCE(SUM(practice_seconds),0) AS practice_seconds,
             COALESCE(SUM(words_saved),0) AS words_saved,
             COALESCE(SUM(messages_sent),0) AS messages_sent,
             COALESCE(SUM(lessons_completed),0) AS lessons_completed,
             COALESCE(SUM(reviews_done),0) AS reviews_done,
             COUNT(*) AS active_days
      FROM user_activity_daily WHERE user_id = ${userId}`;
    const r = rows[0];
    return {
      practiceSeconds: Number(r?.practice_seconds ?? 0),
      wordsSaved: Number(r?.words_saved ?? 0),
      messagesSent: Number(r?.messages_sent ?? 0),
      lessonsCompleted: Number(r?.lessons_completed ?? 0),
      reviewsDone: Number(r?.reviews_done ?? 0),
      activeDays: Number(r?.active_days ?? 0),
    };
  }

  /** Consecutive active days ending today; a day counts when any activity column is > 0. */
  async streak(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ day: Date }[]>`
      SELECT day FROM user_activity_daily
      WHERE user_id = ${userId}
        AND (practice_seconds + words_saved + messages_sent + lessons_completed + reviews_done) > 0
      ORDER BY day DESC LIMIT 400`;
    if (rows.length === 0) return 0;
    const dayMs = 86_400_000;
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    let cursor = todayUtc.getTime();
    const first = new Date(rows[0].day).getTime();
    // Allow the streak to start today or yesterday (today may not have activity yet).
    if (first !== cursor && first !== cursor - dayMs) return 0;
    let streak = 0;
    for (const r of rows) {
      const d = new Date(r.day).getTime();
      if (d === cursor) {
        streak++;
        cursor -= dayMs;
      } else if (d < cursor) {
        break;
      }
    }
    return streak;
  }

  /** Unlock any achievements the user now qualifies for. Returns newly unlocked ids. */
  async checkAchievements(userId: string): Promise<string[]> {
    if (!this.ready) return [];
    const [t, s, unlockedRows] = await Promise.all([
      this.totals(userId),
      this.streak(userId),
      this.prisma.$queryRaw<{ achievement_id: string }[]>`
        SELECT achievement_id FROM user_achievements WHERE user_id = ${userId}`,
    ]);
    const unlocked = new Set(unlockedRows.map((r) => r.achievement_id));
    const newly: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (!unlocked.has(a.id) && a.test(t, s)) {
        await this.prisma.$executeRaw`
          INSERT INTO user_achievements (user_id, achievement_id) VALUES (${userId}, ${a.id})
          ON CONFLICT DO NOTHING`;
        newly.push(a.id);
      }
    }
    return newly;
  }

  async me(userId: string) {
    this.ensureReady();
    const [t, currentStreak, unlockedRows, series, goals] = await Promise.all([
      this.totals(userId),
      this.streak(userId),
      this.prisma.$queryRaw<{ achievement_id: string; unlocked_at: Date }[]>`
        SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ${userId}`,
      this.prisma.$queryRaw<
        { day: Date; practice_seconds: number; words_saved: number; messages_sent: number; lessons_completed: number; reviews_done: number }[]
      >`
        SELECT day, practice_seconds, words_saved, messages_sent, lessons_completed, reviews_done
        FROM user_activity_daily WHERE user_id = ${userId} AND day >= CURRENT_DATE - INTERVAL '29 days'
        ORDER BY day`,
      this.prisma.learningGoal.findMany({ where: { userId }, select: { languageCode: true, dailyMinutes: true, goalText: true } }),
    ]);
    const unlocked = new Map(unlockedRows.map((r) => [r.achievement_id, r.unlocked_at]));
    const todayRow = series.find((r) => new Date(r.day).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10));
    const dailyGoalMinutes = goals.reduce((m, g) => Math.max(m, g.dailyMinutes), 15);
    return {
      streakDays: currentStreak,
      totals: t,
      today: {
        practiceSeconds: Number(todayRow?.practice_seconds ?? 0),
        wordsSaved: Number(todayRow?.words_saved ?? 0),
        messagesSent: Number(todayRow?.messages_sent ?? 0),
        lessonsCompleted: Number(todayRow?.lessons_completed ?? 0),
        reviewsDone: Number(todayRow?.reviews_done ?? 0),
        dailyGoalMinutes,
        goalMet: Number(todayRow?.practice_seconds ?? 0) >= dailyGoalMinutes * 60,
      },
      goals,
      last30Days: series.map((r) => ({
        day: new Date(r.day).toISOString().slice(0, 10),
        practiceSeconds: Number(r.practice_seconds),
        wordsSaved: Number(r.words_saved),
        messagesSent: Number(r.messages_sent),
        lessonsCompleted: Number(r.lessons_completed),
        reviewsDone: Number(r.reviews_done),
      })),
      achievements: ACHIEVEMENTS.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        emoji: a.emoji,
        unlocked: unlocked.has(a.id),
        unlockedAt: unlocked.get(a.id) ?? null,
      })),
    };
  }
}
