import { PrivacyService } from '../privacy/privacy.service';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService, private readonly safety: SafetyService, private readonly privacy: PrivacyService, private readonly mod: ModerationService) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true, username: true, emailVerified: true, isMinor: true,
            lastActiveAt: true, createdAt: true,
            userLanguages: { include: { language: true } },
            learningGoals: true,
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.displayName) await this.mod.checkText(userId, 'NAME', dto.displayName);
    if (dto.bio) await this.mod.checkText(userId, 'NAME', dto.bio);
    if (dto.country !== undefined) {
      const cur = await this.prisma.profile.findUnique({ where: { userId }, select: { country: true } });
      if (cur?.country && cur.country !== dto.country) throw new ForbiddenException('Your country cannot be changed');
    }
    const data = {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
      ...(dto.interests !== undefined
        ? { interests: dto.interests.map((i) => i.trim()).filter(Boolean).slice(0, 10) }
        : {}),
      ...(dto.interfaceLanguage !== undefined ? { interfaceLanguage: dto.interfaceLanguage } : {}),
      ...(dto.showOnlineStatus !== undefined ? { showOnlineStatus: dto.showOnlineStatus } : {}),
      ...(dto.showLastActive !== undefined ? { showLastActive: dto.showLastActive } : {}),
      ...(dto.profileIsPublic !== undefined ? { profileIsPublic: dto.profileIsPublic } : {}),
    };
    const upd = await this.prisma.profile.update({ where: { userId }, data });
    if (dto.photoUrl) this.mod.scanAvatar(userId, dto.photoUrl);
    return upd;
  }

  /** Another user's public profile (respects block + private profiles). */
  async getProfileById(viewerId: string, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, username: true, createdAt: true, lastActiveAt: true, deletedAt: true,
        profile: true,
        userLanguages: { include: { language: true } },
      },
    });
    if (!user || user.deletedAt || !user.profile) throw new NotFoundException('User not found');
    const blocked = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: viewerId, blockedId: id }, { blockerId: id, blockedId: viewerId }] },
    });
    if (blocked && blocked.blockerId === id) throw new ForbiddenException('BLOCKED_BY_USER');
    if (blocked || (viewerId !== id && (await this.safety.isCountryBlockedEitherWay(viewerId, id)))) throw new ForbiddenException('Profile unavailable');
    const isSelf = viewerId === id;
    if (!isSelf && (await this.privacy.shouldRecordView(viewerId))) {
      // Record the visit for the owner's VIP "Visitors" list. Never blocks or fails the profile load.
      this.prisma.$executeRaw`
        INSERT INTO profile_views (viewer_id, viewed_id, viewed_at, views) VALUES (${viewerId}, ${id}, now(), 1)
        ON CONFLICT (viewer_id, viewed_id) DO UPDATE SET viewed_at = now(), views = profile_views.views + 1`.catch(() => undefined);
    }
    if (!user.profile.profileIsPublic && !isSelf) throw new ForbiddenException('This profile is private');
    const [followers, following, isFollowing] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
      this.prisma.follow.findFirst({ where: { followerId: viewerId, followingId: id } }),
    ]);
    const p = user.profile;
    return {
      id: user.id,
      username: user.username,
      displayName: p.displayName,
      bio: p.bio,
      photoUrl: p.photoUrl,
      country: p.country,
      interests: p.interests,
      createdAt: user.createdAt,
      lastActiveAt: p.showLastActive || isSelf ? user.lastActiveAt : null,
      languages: user.userLanguages.map((l) => ({ code: l.languageCode, name: l.language.name, type: l.type, proficiency: l.proficiency })),
      followers,
      following,
      isFollowing: !!isFollowing,
      isSelf,
    };
  }
}
