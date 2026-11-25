import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateCommentDto, CreatePostDto } from './dto/post.dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
  ) {}

  async create(userId: string, dto: CreatePostDto) {
    return this.prisma.post.create({
      data: {
        authorId: userId,
        body: dto.body,
        languageCode: dto.languageCode,
        images: dto.imageUrls?.length
          ? { create: dto.imageUrls.map((url, i) => ({ url, position: i })) }
          : undefined,
      },
      include: { images: true },
    });
  }

  /**
   * Feed: posts from people I follow + my own posts first-class, then recent
   * public posts; authors who blocked me / I blocked are excluded.
   */
  async feed(userId: string, before?: string, limit = 20) {
    const take = Math.min(limit, 50);
    const blocked = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const excluded = new Set<string>();
    for (const b of blocked) {
      excluded.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }
    const posts = await this.prisma.post.findMany({
      where: {
        deletedAt: null,
        authorId: { notIn: [...excluded] },
        author: { status: 'ACTIVE', deletedAt: null, profile: { is: { profileIsPublic: true } } },
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        author: {
          select: {
            id: true, username: true,
            profile: { select: { displayName: true, photoUrl: true, country: true } },
          },
        },
        images: true,
        _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
        likes: { where: { userId }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });
    const hasMore = posts.length > take;
    const page = hasMore ? posts.slice(0, take) : posts;
    return {
      results: page.map((p) => ({
        id: p.id,
        body: p.body,
        languageCode: p.languageCode,
        createdAt: p.createdAt,
        author: p.author,
        images: p.images,
        commentCount: p._count.comments,
        likeCount: p._count.likes,
        likedByMe: p.likes.length > 0,
      })),
      nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  async getOne(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true, username: true,
            profile: { select: { displayName: true, photoUrl: true, country: true } },
          },
        },
        images: true,
        _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
      },
    });
    if (!post || post.deletedAt) throw new NotFoundException('Post not found');
    return post;
  }

  async remove(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException('You can only delete your own posts');
    await this.prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  async comment(userId: string, postId: string, dto: CreateCommentDto) {
    await this.getOne(postId);
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.postId !== postId || parent.deletedAt) {
        throw new NotFoundException('Parent comment not found');
      }
    }
    const comment = await this.prisma.comment.create({
      data: { postId, authorId: userId, body: dto.body, parentId: dto.parentId },
      include: {
        author: {
          select: {
            id: true, username: true,
            profile: { select: { displayName: true, photoUrl: true } },
          },
        },
      },
    });
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (post && post.authorId !== userId) {
      await this.prisma.notification.create({
        data: {
          recipientId: post.authorId, actorId: userId,
          type: dto.parentId ? 'REPLY' : 'COMMENT',
          payload: { postId, commentId: comment.id },
        },
      });
    }
    return comment;
  }

  async comments(postId: string, page = 1, limit = 30) {
    await this.getOne(postId);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.comment.count({ where: { postId, deletedAt: null } }),
      this.prisma.comment.findMany({
        where: { postId, deletedAt: null },
        include: {
          author: {
            select: {
              id: true, username: true,
              profile: { select: { displayName: true, photoUrl: true } },
            },
          },
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 50),
      }),
    ]);
    return { page, limit, total, results: rows };
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.deletedAt) throw new NotFoundException('Comment not found');
    const post = await this.prisma.post.findUnique({ where: { id: comment.postId }, select: { authorId: true } });
    // comment author or post author may remove a comment
    if (comment.authorId !== userId && post?.authorId !== userId) {
      throw new ForbiddenException('Not allowed');
    }
    await this.prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  async likePost(userId: string, postId: string) {
    const post = await this.getOne(postId);
    await this.prisma.like.upsert({
      where: { userId_postId_commentId: { userId, postId, commentId: null as any } },
      update: {},
      create: { userId, postId },
    }).catch(async () => {
      // nullable-commentId unique edge: fall back to find-or-create
      const existing = await this.prisma.like.findFirst({ where: { userId, postId, commentId: null } });
      if (!existing) await this.prisma.like.create({ data: { userId, postId } });
    });
    if (post.authorId !== userId) {
      await this.prisma.notification.create({
        data: { recipientId: post.authorId, actorId: userId, type: 'LIKE', payload: { postId } },
      });
    }
    return { success: true, liked: true };
  }

  async unlikePost(userId: string, postId: string) {
    await this.prisma.like.deleteMany({ where: { userId, postId, commentId: null } });
    return { success: true, liked: false };
  }

  async likeComment(userId: string, commentId: string) {
    const existing = await this.prisma.like.findFirst({ where: { userId, commentId } });
    if (!existing) await this.prisma.like.create({ data: { userId, commentId } });
    return { success: true, liked: true };
  }

  async unlikeComment(userId: string, commentId: string) {
    await this.prisma.like.deleteMany({ where: { userId, commentId } });
    return { success: true, liked: false };
  }
}
