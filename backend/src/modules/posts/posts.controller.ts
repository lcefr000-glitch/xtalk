import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCommentDto, CreatePostDto } from './dto/post.dto';
import { PostsService } from './posts.service';

@ApiTags('moments')
@ApiBearerAuth()
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post('posts')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user.id, dto);
  }

  @Get('feed')
  feed(@CurrentUser() user: AuthUser, @Query('before') before?: string, @Query('limit') limit?: string) {
    return this.posts.feed(user.id, before, limit ? parseInt(limit, 10) : 20);
  }

  @Get('posts/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.getOne(id);
  }

  @HttpCode(200)
  @Delete('posts/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.remove(user.id, id);
  }

  @Post('posts/:id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCommentDto) {
    return this.posts.comment(user.id, id, dto);
  }

  @Get('posts/:id/comments')
  comments(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.posts.comments(id, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 30);
  }

  @HttpCode(200)
  @Delete('comments/:id')
  deleteComment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.deleteComment(user.id, id);
  }

  @Post('posts/:id/like')
  likePost(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.likePost(user.id, id);
  }

  @HttpCode(200)
  @Delete('posts/:id/like')
  unlikePost(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.unlikePost(user.id, id);
  }

  @Post('comments/:id/like')
  likeComment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.likeComment(user.id, id);
  }

  @HttpCode(200)
  @Delete('comments/:id/like')
  unlikeComment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.unlikeComment(user.id, id);
  }
}
