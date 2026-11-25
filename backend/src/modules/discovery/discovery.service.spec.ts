import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DiscoveryService } from './discovery.service';

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  const prisma = {
    user: { findUniqueOrThrow: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(async (args: any[]) => Promise.all(args)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [DiscoveryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DiscoveryService);
  });

  it('search separates minors from adults', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isMinor: true });
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    await service.search('u1', { native: 'en' });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.isMinor).toBe(true);
    expect(where.blocksMade).toEqual({ none: { blockedId: 'u1' } });
    expect(where.blocksReceived).toEqual({ none: { blockerId: 'u1' } });
  });

  it('adults never see minors', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isMinor: false });
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    await service.search('u1', {});
    expect(prisma.user.findMany.mock.calls[0][0].where.isMinor).toBe(false);
  });

  it('recommendations need native + learning languages set', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isMinor: false, userLanguages: [] });
    const res = await service.recommendations('u1');
    expect(res.results).toEqual([]);
    expect(res.hint).toBeDefined();
  });

  it('recommendations match complementary skills', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      isMinor: false,
      userLanguages: [
        { languageCode: 'ar', type: 'NATIVE' },
        { languageCode: 'de', type: 'LEARNING' },
      ],
    });
    prisma.user.findMany.mockResolvedValue([]);
    await service.recommendations('u1');
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.AND[0].userLanguages.some).toEqual({ languageCode: { in: ['de'] }, type: 'NATIVE' });
    expect(where.AND[1].userLanguages.some).toEqual({ languageCode: 'ar', type: 'LEARNING' });
  });

  it('hides presence fields when the owner disabled them', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isMinor: false });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u2', username: 'x', lastActiveAt: new Date(),
        profile: { displayName: 'X', showOnlineStatus: false, showLastActive: false },
        userLanguages: [],
      },
    ]);
    const res = await service.search('u1', {});
    expect(res.results[0].isOnline).toBeNull();
    expect(res.results[0].lastActiveAt).toBeNull();
  });
});
