import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SafetyService } from '../safety/safety.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let service: ProfilesService;
  const prisma = {
    profile: { findUnique: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [ProfilesService, { provide: PrismaService, useValue: prisma }, { provide: SafetyService, useValue: { countryBlockedUserIds: jest.fn().mockResolvedValue([]), isCountryBlockedEitherWay: jest.fn().mockResolvedValue(false) } }],
    }).compile();
    service = module.get(ProfilesService);
  });

  it('updates privacy flags and trims interests', async () => {
    prisma.profile.update.mockImplementation(({ data }) => Promise.resolve(data));
    const res: any = await service.updateMyProfile('u1', {
      showOnlineStatus: false,
      interests: ['  chess  ', '', 'arabic poetry'],
    });
    expect(res.showOnlineStatus).toBe(false);
    expect(res.interests).toEqual(['chess', 'arabic poetry']);
  });

  it('omits untouched fields from the update payload', async () => {
    prisma.profile.update.mockImplementation(({ data }) => Promise.resolve(data));
    const res: any = await service.updateMyProfile('u1', { bio: 'hello' });
    expect(Object.keys(res)).toEqual(['bio']);
  });

  it('getMyProfile throws when missing', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);
    await expect(service.getMyProfile('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
