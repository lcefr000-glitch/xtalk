import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('checkUsername rejects invalid formats', async () => {
    const res = await service.checkUsername('Ab!');
    expect(res.available).toBe(false);
    expect(res.reason).toBe('invalid_format');
  });

  it('checkUsername reports taken names', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    const res = await service.checkUsername('sara_dev');
    expect(res.available).toBe(false);
  });

  it('checkUsername reports free names', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await service.checkUsername('free_name');
    expect(res.available).toBe(true);
  });

  it('updateMe rejects a username taken by someone else', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'someone-else' });
    await expect(service.updateMe('u1', { username: 'taken' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('deleteMe soft-deletes and revokes sessions', async () => {
    const res = await service.deleteMe('u1');
    expect(res.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('getMe never leaks the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.c', passwordHash: 'secret-hash', deletedAt: null,
      profile: null, settings: null, userLanguages: [], learningGoals: [], subscription: null,
    });
    const me = await service.getMe('u1');
    expect((me as any).passwordHash).toBeUndefined();
  });

  it('getMe throws for deleted users', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: new Date() });
    await expect(service.getMe('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
