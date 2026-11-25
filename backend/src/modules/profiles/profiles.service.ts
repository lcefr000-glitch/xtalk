import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.profile.update({ where: { userId }, data });
  }
}
