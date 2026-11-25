import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page = 1, limit = 30) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where: { recipientId: userId } }),
      this.prisma.notification.findMany({
        where: { recipientId: userId },
        include: {
          actor: {
            select: {
              id: true, username: true,
              profile: { select: { displayName: true, photoUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 50),
      }),
    ]);
    return { page, limit, total, results: rows };
  }

  unreadCount(userId: string) {
    return this.prisma.notification
      .count({ where: { recipientId: userId, readAt: null } })
      .then((unread) => ({ unread }));
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, recipientId: userId },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
