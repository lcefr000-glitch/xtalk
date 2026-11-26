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
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

@Injectable()
export class FriendsService implements OnModuleInit {
  private readonly log = new Logger('Friends');
  private ready = false;

  constructor(private readonly prisma: PrismaService, private readonly safety: SafetyService) {}

  /** Additive, idempotent bootstrap: CREATE TABLE IF NOT EXISTS + enum value additions only. */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS friend_requests (
          id TEXT PRIMARY KEY,
          sender_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          responded_at TIMESTAMPTZ,
          UNIQUE (sender_id, receiver_id)
        )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests (receiver_id, status)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON friend_requests (sender_id, status)`,
      );
      // Extend the Prisma enum so notifications can carry friend requests.
      await this.prisma.$executeRawUnsafe(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FRIEND_REQUEST'`);
      this.ready = true;
      this.log.log('friend tables ready');
    } catch (e) {
      this.log.error('friends bootstrap failed: ' + (e as Error).message);
    }
  }

  private ensureReady() {
    if (!this.ready) throw new ServiceUnavailableException('Friend requests are not available right now');
  }

  private async assertCanInteract(a: string, b: string) {
    const target = await this.prisma.user.findUnique({ where: { id: b }, select: { id: true, status: true, deletedAt: true } });
    if (!target || target.status !== 'ACTIVE' || target.deletedAt) throw new NotFoundException('User not found');
    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    });
    if (blocked || (await this.safety.isCountryBlockedEitherWay(a, b))) throw new ForbiddenException('Cannot send a friend request to this user');
  }

  async send(senderId: string, receiverId: string) {
    this.ensureReady();
    if (senderId === receiverId) throw new BadRequestException('Cannot send a friend request to yourself');
    await this.assertCanInteract(senderId, receiverId);
    const existing = await this.prisma.$queryRaw<{ id: string; status: string; sender_id: string }[]>`
      SELECT id, status, sender_id FROM friend_requests
      WHERE (sender_id = ${senderId} AND receiver_id = ${receiverId})
         OR (sender_id = ${receiverId} AND receiver_id = ${senderId})
      ORDER BY created_at DESC LIMIT 1`;
    const last = existing[0];
    if (last?.status === 'PENDING') {
      if (last.sender_id === receiverId) {
        // The other side already asked: accept instead of creating a duplicate.
        return this.accept(receiverId, last.id);
      }
      throw new ConflictException('Friend request already sent');
    }
    if (last?.status === 'ACCEPTED') throw new ConflictException('Already friends');
    const id = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO friend_requests (id, sender_id, receiver_id) VALUES (${id}, ${senderId}, ${receiverId})
      ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = 'PENDING', created_at = now(), responded_at = NULL`;
    await this.prisma.notification
      .create({ data: { recipientId: receiverId, actorId: senderId, type: 'FRIEND_REQUEST' as never } })
      .catch(() => undefined);
    return { id, status: 'PENDING' };
  }

  async accept(userId: string, requestId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ id: string; sender_id: string; receiver_id: string; status: string }[]>`
      SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = ${requestId}`;
    const req = rows[0];
    if (!req || req.receiver_id !== userId) throw new NotFoundException('Friend request not found');
    if (req.status !== 'PENDING') throw new ConflictException('Request already answered');
    await this.prisma.$executeRaw`
      UPDATE friend_requests SET status = 'ACCEPTED', responded_at = now() WHERE id = ${requestId}`;
    await this.prisma.notification
      .create({ data: { recipientId: req.sender_id, actorId: userId, type: 'FRIEND_REQUEST' as never } })
      .catch(() => undefined);
    return { success: true, status: 'ACCEPTED' };
  }

  async decline(userId: string, requestId: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`
      UPDATE friend_requests SET status = 'DECLINED', responded_at = now()
      WHERE id = ${requestId} AND receiver_id = ${userId} AND status = 'PENDING'`;
    if (!n) throw new NotFoundException('Friend request not found');
    return { success: true, status: 'DECLINED' };
  }

  async cancel(userId: string, requestId: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`
      DELETE FROM friend_requests WHERE id = ${requestId} AND sender_id = ${userId} AND status = 'PENDING'`;
    if (!n) throw new NotFoundException('Friend request not found');
    return { success: true };
  }

  async incoming(userId: string) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT r.id, r.created_at, u.id AS user_id, u.username, p."displayName", p."photoUrl", p.country
      FROM friend_requests r
      JOIN "User" u ON u.id = r.sender_id
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE r.receiver_id = ${userId} AND r.status = 'PENDING'
      ORDER BY r.created_at DESC`;
  }

  async outgoing(userId: string) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT r.id, r.created_at, u.id AS user_id, u.username, p."displayName", p."photoUrl", p.country
      FROM friend_requests r
      JOIN "User" u ON u.id = r.receiver_id
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE r.sender_id = ${userId} AND r.status = 'PENDING'
      ORDER BY r.created_at DESC`;
  }

  async friends(userId: string) {
    this.ensureReady();
    return this.prisma.$queryRaw<unknown[]>`
      SELECT r.id AS request_id, r.responded_at AS friends_since,
             u.id AS user_id, u.username, u."lastActiveAt", p."displayName", p."photoUrl", p.country
      FROM friend_requests r
      JOIN "User" u ON u.id = CASE WHEN r.sender_id = ${userId} THEN r.receiver_id ELSE r.sender_id END
      LEFT JOIN "Profile" p ON p."userId" = u.id
      WHERE (r.sender_id = ${userId} OR r.receiver_id = ${userId}) AND r.status = 'ACCEPTED'
      ORDER BY r.responded_at DESC`;
  }

  async unfriend(userId: string, otherId: string) {
    this.ensureReady();
    const n = await this.prisma.$executeRaw`
      DELETE FROM friend_requests
      WHERE status = 'ACCEPTED'
        AND ((sender_id = ${userId} AND receiver_id = ${otherId})
          OR (sender_id = ${otherId} AND receiver_id = ${userId}))`;
    if (!n) throw new NotFoundException('Not friends');
    return { success: true };
  }

  /** Relationship of `userId` toward `otherId`: NONE | PENDING_OUT | PENDING_IN | FRIENDS */
  async status(userId: string, otherId: string) {
    this.ensureReady();
    const rows = await this.prisma.$queryRaw<{ status: string; sender_id: string; id: string }[]>`
      SELECT id, status, sender_id FROM friend_requests
      WHERE (sender_id = ${userId} AND receiver_id = ${otherId})
         OR (sender_id = ${otherId} AND receiver_id = ${userId})
      ORDER BY created_at DESC LIMIT 1`;
    const r = rows[0];
    if (!r || r.status === 'DECLINED') return { status: 'NONE' };
    if (r.status === 'ACCEPTED') return { status: 'FRIENDS' };
    return { status: r.sender_id === userId ? 'PENDING_OUT' : 'PENDING_IN', requestId: r.id };
  }
}
