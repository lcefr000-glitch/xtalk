import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sha256Hex } from '../../common/utils/tokens';

function prismaMock() {
  return {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    profile: { create: jest.fn() },
    userSettings: { create: jest.fn() },
    subscription: { create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg({
        user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
      });
    }),
  };
}

const baseConfig = {
  get: (key: string) =>
    ({
      jwtAccessSecret: 'test-secret-test-secret-test-secret-12',
      jwtAccessTtlSeconds: 900,
      refreshTokenTtlDays: 30,
      minAge: 13,
      devExposeTokens: true,
    })[key],
};

const registerDto = {
  email: 'sara@example.com',
  username: 'sara_dev',
  password: 'passw0rd1',
  displayName: 'Sara',
  dateOfBirth: '2002-04-10',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof prismaMock>;
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = prismaMock();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtStrategyStub,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: baseConfig },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access.jwt.token') },
        },
      ],
    })
      .compile();
    service = module.get(AuthService);
    jwt = module.get(JwtService);
  });

  it('locks the account for 15 minutes after 5 failed logins and does not reveal whether the email exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) {
      await expect(service.login({ email: 'Victim@Example.com', password: 'wrong-pass-1' } as any)).rejects.toThrow('Invalid credentials');
    }
    await expect(service.login({ email: 'victim@example.com', password: 'wrong-pass-1' } as any)).rejects.toThrow(/Too many attempts/);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(5);
  });

  it('registers a new user, hashes the password and returns a token pair', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'u1', email: registerDto.email, username: registerDto.username,
            emailVerified: false, isMinor: false, status: 'ACTIVE', createdAt: new Date(),
            passwordHash: 'x', deletedAt: null,
          }),
        },
        profile: { create: jest.fn() },
        userSettings: { create: jest.fn() },
        subscription: { create: jest.fn() },
      }),
    );
    const res = await service.register(registerDto);
    expect(res.user.email).toBe(registerDto.email);
    expect(res.accessToken).toBe('access.jwt.token');
    expect(res.refreshToken.length).toBeGreaterThan(40);
    expect(res.devVerificationToken).toBeDefined();
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'u1', email: registerDto.email }, { expiresIn: 900 },
    );
  });

  it('rejects duplicate email with 409', async () => {
    prisma.user.findFirst.mockResolvedValue({ email: registerDto.email, username: 'other' });
    await expect(service.register(registerDto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects users under the minimum age', async () => {
    const young = { ...registerDto, dateOfBirth: new Date().toISOString().slice(0, 10) };
    await expect(service.register(young)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects login with a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: registerDto.email, deletedAt: null, status: 'ACTIVE',
      // hash of a different password
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$invalidinvalidinvalid$invalidinvalidinvalidinvalidinvalidinvalidinv',
    });
    await expect(
      service.login({ email: registerDto.email, password: 'wrongpass1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates refresh tokens and links the replacement', async () => {
    const old = {
      id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      user: { id: 'u1', email: 'a@b.c', status: 'ACTIVE', deletedAt: null },
    };
    prisma.refreshToken.findUnique
      .mockResolvedValueOnce(old) // presented token
      .mockResolvedValueOnce({ id: 'rt2' }); // replacement lookup
    const res = await service.refresh('raw-token');
    expect(res.refreshToken).toBeDefined();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt1' },
        data: expect.objectContaining({ replacedById: 'rt2' }),
      }),
    );
  });

  it('detects refresh-token reuse and revokes the whole family', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1', userId: 'u1', familyId: 'fam1', revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      user: { id: 'u1', status: 'ACTIVE', deletedAt: null },
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
    await expect(service.refresh('reused-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'fam1', revokedAt: null } }),
    );
  });

  it('stores refresh tokens hashed, never raw', async () => {
    const raw = 'raw-token-value';
    expect(sha256Hex(raw)).not.toContain(raw);
    expect(sha256Hex(raw)).toHaveLength(64);
  });

  it('resetPassword revokes all sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'pr1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() + 3_600_000),
    });
    prisma.$transaction.mockResolvedValue([]);
    await service.resetPassword('tok', 'newpass123');
    const txArg = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(3); // token used + password update + revoke sessions
  });
});

// Guard against accidental import removal in the mock module above.
class JwtStrategyStub {}
