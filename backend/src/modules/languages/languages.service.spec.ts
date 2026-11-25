import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LanguagesService } from './languages.service';

function prismaMock() {
  return {
    language: { findUnique: jest.fn(), findMany: jest.fn() },
    userLanguage: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    learningGoal: { upsert: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn({
        userLanguage: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn().mockImplementation(({ data, include }) => ({ id: 'ul1', ...data })),
          update: jest.fn().mockImplementation(({ data }) => ({ id: 'ul1', ...data })),
        },
        learningGoal: { upsert: jest.fn() },
      });
    }),
  };
}

describe('LanguagesService', () => {
  let service: LanguagesService;
  let prisma: ReturnType<typeof prismaMock>;

  beforeEach(async () => {
    prisma = prismaMock();
    const module = await Test.createTestingModule({
      providers: [LanguagesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LanguagesService);
  });

  it('rejects unknown language codes', async () => {
    prisma.language.findUnique.mockResolvedValue(null);
    await expect(
      service.addUserLanguage('u1', { code: 'xx', type: 'LEARNING' as any, proficiency: 'BEGINNER' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects adding the native language as a learning language', async () => {
    prisma.language.findUnique.mockResolvedValue({ code: 'en', isActive: true });
    prisma.userLanguage.findFirst.mockResolvedValue({ id: 'n1', languageCode: 'en', type: 'NATIVE' });
    prisma.userLanguage.findUnique.mockResolvedValue(null);
    await expect(
      service.addUserLanguage('u1', { code: 'en', type: 'LEARNING' as any, proficiency: 'BEGINNER' as any }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects adding a duplicate learning language', async () => {
    prisma.language.findUnique.mockResolvedValue({ code: 'fr', isActive: true });
    prisma.userLanguage.findFirst.mockResolvedValue({ id: 'n1', languageCode: 'ar', type: 'NATIVE' });
    prisma.userLanguage.findUnique.mockResolvedValue({ id: 'ul9', languageCode: 'fr' });
    await expect(
      service.addUserLanguage('u1', { code: 'fr', type: 'LEARNING' as any, proficiency: 'BEGINNER' as any }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds a learning language and upserts its goal', async () => {
    prisma.language.findUnique.mockResolvedValue({ code: 'de', isActive: true });
    prisma.userLanguage.findFirst.mockResolvedValue({ id: 'n1', languageCode: 'ar', type: 'NATIVE' });
    prisma.userLanguage.findUnique.mockResolvedValue(null);
    const res = await service.addUserLanguage('u1', {
      code: 'de', type: 'LEARNING' as any, proficiency: 'BEGINNER' as any, dailyMinutes: 30,
    });
    expect(res.languageCode).toBe('de');
    expect(res.type).toBe('LEARNING');
  });

  it('forbids removing the only (native) language', async () => {
    prisma.userLanguage.findUnique.mockResolvedValue({ id: 'n1', languageCode: 'ar', type: 'NATIVE' });
    prisma.userLanguage.count.mockResolvedValue(0);
    await expect(service.removeUserLanguage('u1', 'ar')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a learning language and its goal', async () => {
    prisma.userLanguage.findUnique.mockResolvedValue({ id: 'l1', languageCode: 'de', type: 'LEARNING' });
    prisma.$transaction.mockResolvedValue([{}, {}]);
    const res = await service.removeUserLanguage('u1', 'de');
    expect(res.success).toBe(true);
  });

  it('throws when updating a language the user does not have', async () => {
    prisma.userLanguage.findUnique.mockResolvedValue(null);
    await expect(
      service.updateUserLanguage('u1', 'jp', { proficiency: 'ADVANCED' as any }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
