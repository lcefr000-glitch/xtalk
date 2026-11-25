import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { ConversationsService } from './conversations.service';

function prismaMock() {
  return {
    user: { findUnique: jest.fn() },
    conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    conversationMember: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    message: {
      findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(),
      create: jest.fn(), update: jest.fn(),
    },
    notification: { createMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn({
        message: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data, attachments: [] })) },
        conversation: { update: jest.fn() },
        notification: { createMany: jest.fn() },
      });
    }),
  };
}

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: ReturnType<typeof prismaMock>;
  const safety = { isBlockedEitherWay: jest.fn().mockResolvedValue(false) };

  beforeEach(async () => {
    prisma = prismaMock();
    safety.isBlockedEitherWay.mockResolvedValue(false);
    const module = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SafetyService, useValue: safety },
      ],
    }).compile();
    service = module.get(ConversationsService);
  });

  it('rejects messaging yourself', async () => {
    await expect(service.createDirect('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when blocked either way', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', status: 'ACTIVE', deletedAt: null });
    safety.isBlockedEitherWay.mockResolvedValue(true);
    await expect(service.createDirect('u1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reuses an existing 1:1 conversation', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', status: 'ACTIVE', deletedAt: null });
    prisma.conversation.findFirst.mockResolvedValue({ id: 'conv1' });
    const res = await service.createDirect('u1', 'u2');
    expect(res.id).toBe('conv1');
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('text messages need a body', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'cm1' });
    await expect(
      service.sendMessage('u1', 'c1', { type: 'TEXT', body: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('image messages need an attachment', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'cm1' });
    await expect(
      service.sendMessage('u1', 'c1', { type: 'IMAGE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends a text message and bumps the conversation', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'cm1' });
    prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    const res = await service.sendMessage('u1', 'c1', { type: 'TEXT', body: 'hello' });
    expect(res.body).toBe('hello');
  });

  it('only the sender can edit or delete', async () => {
    prisma.message.findUnique.mockResolvedValue({ id: 'm1', senderId: 'someone-else', deletedAt: null });
    await expect(service.editMessage('u1', 'm1', { body: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteMessage('u1', 'm1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('non-members cannot read messages', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue(null);
    await expect(service.getMessages('u1', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('replyToId must reference a message in the same conversation', async () => {
    prisma.conversationMember.findFirst.mockResolvedValue({ id: 'cm1' });
    prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    prisma.message.findUnique.mockResolvedValue({ id: 'm9', conversationId: 'other', deletedAt: null });
    await expect(
      service.sendMessage('u1', 'c1', { type: 'TEXT', body: 'hi', replyToId: 'm9' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
