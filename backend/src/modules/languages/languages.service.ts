import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AddUserLanguageDto, UpdateUserLanguageDto } from './dto/user-language.dto';

@Injectable()
export class LanguagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catalogue search: name / nativeName / code, active languages only. */
  list(search?: string, rtl?: boolean) {
    return this.prisma.language.findMany({
      where: {
        isActive: true,
        ...(rtl !== undefined ? { isRtl: rtl } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { nativeName: { contains: search, mode: 'insensitive' } },
                { code: { equals: search.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  getUserLanguages(userId: string) {
    return this.prisma.userLanguage.findMany({
      where: { userId },
      include: { language: true },
      orderBy: [{ type: 'asc' }, { language: { name: 'asc' } }],
    });
  }

  /**
   * Exactly one NATIVE language per user: adding a native language replaces the
   * previous one (its row is demoted to LEARNING at ADVANCED) unless it is the
   * same code. Learning languages are unique per code.
   */
  async addUserLanguage(userId: string, dto: AddUserLanguageDto) {
    const language = await this.prisma.language.findUnique({ where: { code: dto.code } });
    if (!language || !language.isActive) {
      throw new BadRequestException(`Unknown or inactive language code: ${dto.code}`);
    }

    if (dto.type === 'NATIVE') {
      return this.prisma.$transaction(async (tx) => {
        const currentNative = await tx.userLanguage.findFirst({
          where: { userId, type: 'NATIVE' },
        });
        if (currentNative && currentNative.languageCode === dto.code) {
          return tx.userLanguage.update({
            where: { id: currentNative.id },
            data: { proficiency: dto.proficiency },
            include: { language: true },
          });
        }
        if (currentNative) {
          await tx.userLanguage.update({
            where: { id: currentNative.id },
            data: { type: 'LEARNING', proficiency: 'ADVANCED' },
          });
        }
        const existing = await tx.userLanguage.findUnique({
          where: { userId_languageCode: { userId, languageCode: dto.code } },
        });
        if (existing) {
          return tx.userLanguage.update({
            where: { id: existing.id },
            data: { type: 'NATIVE', proficiency: dto.proficiency },
            include: { language: true },
          });
        }
        return tx.userLanguage.create({
          data: { userId, languageCode: dto.code, type: 'NATIVE', proficiency: dto.proficiency },
          include: { language: true },
        });
      });
    }

    const native = await this.prisma.userLanguage.findFirst({
      where: { userId, type: 'NATIVE' },
    });
    if (native?.languageCode === dto.code) {
      throw new ConflictException('This language is already set as your native language');
    }
    const existing = await this.prisma.userLanguage.findUnique({
      where: { userId_languageCode: { userId, languageCode: dto.code } },
    });
    if (existing) throw new ConflictException('Language already added');

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.userLanguage.create({
        data: { userId, languageCode: dto.code, type: 'LEARNING', proficiency: dto.proficiency },
        include: { language: true },
      });
      if (dto.dailyMinutes !== undefined || dto.goalText !== undefined) {
        await tx.learningGoal.upsert({
          where: { userId_languageCode: { userId, languageCode: dto.code } },
          update: { dailyMinutes: dto.dailyMinutes ?? 15, goalText: dto.goalText },
          create: {
            userId,
            languageCode: dto.code,
            dailyMinutes: dto.dailyMinutes ?? 15,
            goalText: dto.goalText,
          },
        });
      }
      return created;
    });
  }

  async updateUserLanguage(userId: string, code: string, dto: UpdateUserLanguageDto) {
    const row = await this.prisma.userLanguage.findUnique({
      where: { userId_languageCode: { userId, languageCode: code } },
    });
    if (!row) throw new NotFoundException('Language not found on your profile');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.userLanguage.update({
        where: { id: row.id },
        data: { ...(dto.proficiency !== undefined ? { proficiency: dto.proficiency } : {}) },
        include: { language: true },
      });
      if (dto.dailyMinutes !== undefined || dto.goalText !== undefined) {
        await tx.learningGoal.upsert({
          where: { userId_languageCode: { userId, languageCode: code } },
          update: {
            ...(dto.dailyMinutes !== undefined ? { dailyMinutes: dto.dailyMinutes } : {}),
            ...(dto.goalText !== undefined ? { goalText: dto.goalText } : {}),
          },
          create: {
            userId,
            languageCode: code,
            dailyMinutes: dto.dailyMinutes ?? 15,
            goalText: dto.goalText,
          },
        });
      }
      return updated;
    });
  }

  /** The native language cannot be removed while it is the only one. */
  async removeUserLanguage(userId: string, code: string) {
    const row = await this.prisma.userLanguage.findUnique({
      where: { userId_languageCode: { userId, languageCode: code } },
    });
    if (!row) throw new NotFoundException('Language not found on your profile');
    if (row.type === 'NATIVE') {
      const others = await this.prisma.userLanguage.count({
        where: { userId, NOT: { id: row.id } },
      });
      if (others === 0) {
        throw new BadRequestException('Set another native language before removing this one');
      }
    }
    await this.prisma.$transaction([
      this.prisma.learningGoal.deleteMany({ where: { userId, languageCode: code } }),
      this.prisma.userLanguage.delete({ where: { id: row.id } }),
    ]);
    return { success: true };
  }
}
