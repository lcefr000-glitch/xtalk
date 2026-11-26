import { PrivacyService } from '../privacy/privacy.service';
import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { FollowsService } from './follows.service';

@ApiTags('follows')
@ApiBearerAuth()
@Controller()
export class FollowsController {
  constructor(private readonly follows: FollowsService, private readonly privacy: PrivacyService) {}

  @Post('users/:id/follow')
  follow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.follows.follow(user.id, id);
  }

  @HttpCode(200)
  @Delete('users/:id/follow')
  unfollow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.follows.unfollow(user.id, id);
  }

  @Get('users/me/followers')
  followers(@CurrentUser() user: AuthUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.follows.followers(user.id, page ? parseInt(page, 10) : 1, limit ? Math.min(parseInt(limit, 10), 50) : 20);
  }

  @Get('users/me/following')
  following(@CurrentUser() user: AuthUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.follows.following(user.id, page ? parseInt(page, 10) : 1, limit ? Math.min(parseInt(limit, 10), 50) : 20);
  }

  @Get('users/:id/followers')
  async userFollowers(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    if (user.id !== id && !(await this.privacy.get(id)).showFollowLists) return { total: 0, page: 1, limit: 0, results: [], hidden: true };
    return this.follows.followers(id, page ? parseInt(page, 10) : 1, limit ? Math.min(parseInt(limit, 10), 50) : 30);
  }

  @Get('users/:id/following')
  async userFollowing(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    if (user.id !== id && !(await this.privacy.get(id)).showFollowLists) return { total: 0, page: 1, limit: 0, results: [], hidden: true };
    return this.follows.following(id, page ? parseInt(page, 10) : 1, limit ? Math.min(parseInt(limit, 10), 50) : 30);
  }
}
