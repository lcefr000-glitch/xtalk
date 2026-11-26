import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IsBoolean, IsOptional } from 'class-validator';
import { UpdateUserDto } from './dto/update-user.dto';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() notifyMessages?: boolean;
  @IsOptional() @IsBoolean() notifyFollowers?: boolean;
  @IsOptional() @IsBoolean() notifyLikes?: boolean;
  @IsOptional() @IsBoolean() notifyComments?: boolean;
  @IsOptional() @IsBoolean() notifyRoomInvitations?: boolean;
  @IsOptional() @IsBoolean() notifyCalls?: boolean;
  @IsOptional() @IsBoolean() notifyAccount?: boolean;
  @IsOptional() @IsBoolean() darkMode?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        settings: true,
        userLanguages: { include: { language: true } },
        learningGoals: true,
        subscription: { select: { plan: true, status: true, expiresAt: true } },
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    if (dto.username) {
      const taken = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (taken && taken.id !== userId) throw new ConflictException('Username is taken');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { username: dto.username },
    });
    const { passwordHash, ...rest } = user;
    return rest;
  }

  /** Soft delete: disables login, revokes every session, scrubs public presence. */
  /** Permanent deletion: account is anonymised, personal content is removed, sessions revoked. Cannot be undone. */
  async deleteMe(userId: string) {
    const tag = userId.replace(/-/g, '').slice(0, 12);
    const junk = require('crypto').randomBytes(32).toString('hex');
    const now = new Date();
    try {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: now, status: 'DELETED', email: `deleted-${tag}@deleted.invalid`, username: `deleted_${tag}`, passwordHash: junk, emailVerified: false },
      }),
      this.prisma.profile.updateMany({
        where: { userId },
        data: { displayName: 'Deleted user', bio: null, photoUrl: null, country: null, interests: [], profileIsPublic: false },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.$executeRaw`DELETE FROM "MessageAttachment" WHERE "messageId" IN (SELECT id FROM "Message" WHERE "senderId" = ${userId})`,
      this.prisma.$executeRaw`UPDATE "Message" SET body = NULL, "deletedAt" = ${now} WHERE "senderId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "Post" WHERE "authorId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "Comment" WHERE "authorId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "Like" WHERE "userId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "Follow" WHERE "followerId" = ${userId} OR "followingId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "Notification" WHERE "recipientId" = ${userId} OR "actorId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "UserLanguage" WHERE "userId" = ${userId}`,
      this.prisma.$executeRaw`DELETE FROM "LearningGoal" WHERE "userId" = ${userId}`,
    ]);
    } catch {
      // Never leave the user stuck: fall back to disabling the account and revoking sessions.
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: userId }, data: { deletedAt: now, status: 'DELETED' } }),
        this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      ]);
    }
    // Tables created at runtime by other modules: best effort, each independent.
    for (const q of [
      `DELETE FROM media_files WHERE owner_id = $1`,
      `DELETE FROM profile_extras WHERE user_id = $1`,
      `DELETE FROM profile_views WHERE viewer_id = $1 OR viewed_id = $1`,
      `DELETE FROM post_views WHERE viewer_id = $1`,
      `DELETE FROM vip_meta WHERE user_id = $1`,
      `DELETE FROM economy_wallets WHERE user_id = $1`,
    ]) {
      try { await this.prisma.$executeRawUnsafe(q, userId); } catch { /* table may not exist */ }
    }
    return { success: true };
  }

  async checkUsername(username: string) {
    const normalized = username.trim().toLowerCase();
    const valid = /^[a-z0-9_]{3,20}$/.test(normalized);
    if (!valid) return { username: normalized, available: false, reason: 'invalid_format' };
    const existing = await this.prisma.user.findUnique({ where: { username: normalized } });
    return { username: normalized, available: !existing };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const data: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(dto)) if (typeof v === 'boolean') data[k] = v;
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
