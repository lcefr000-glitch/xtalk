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
  async deleteMe(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), status: 'DELETED' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
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
