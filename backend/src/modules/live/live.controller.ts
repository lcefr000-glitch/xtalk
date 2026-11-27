import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin/admin.guard';
import { LiveService } from './live.service';

class CreateStreamDto {
  @IsString() @IsNotEmpty() @Length(3, 120) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @Length(2, 10) languageCode?: string;
  // Older app builds send the language under this name.
  @IsOptional() @IsString() @MaxLength(10) language?: string;
}

class StageTargetDto {
  @IsOptional() @IsUUID() userId?: string;
}

class KickDto {
  @IsUUID() userId!: string;
}

@ApiTags('live')
@ApiBearerAuth()
@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStreamDto) {
    const { language, ...rest } = dto;
    const lang = (rest.languageCode ?? language ?? '').trim();
    return this.live.create(user.id, { ...rest, languageCode: lang.length >= 2 ? lang : undefined });
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('language') language?: string, @Query('category') category?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.live.list({
      language,
      category,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      limit: limit ? Math.min(Math.max(1, parseInt(limit, 10)), 50) : 20,
    }, user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.live.get(id);
  }

  @Post(':id/token')
  viewerToken(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.live.viewerToken(id, user.id);
  }

  @Post(':id/end')
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.live.end(id, user.id);
  }

  @Post(':id/kick')
  kick(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KickDto) {
    return this.live.kick(id, user.id, dto.userId);
  }

  @Get(':id/viewers')
  viewers(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.live.viewers(id, user.id);
  }

  @Post(':id/invite')
  invite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KickDto) {
    return this.live.invite(id, user.id, dto.userId);
  }

  @Get(':id/stage')
  stage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.live.stageState(id, user.id);
  }

  @Post(':id/stage/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.live.acceptInvite(id, user.id);
  }

  @Post(':id/stage/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.live.declineInvite(id, user.id);
  }

  @Post(':id/stage/leave')
  leaveStage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StageTargetDto) {
    return this.live.leaveStage(id, user.id, dto?.userId);
  }

  @Get(':id/messages')
  messages(@Param('id', ParseUUIDPipe) id: string, @Query('limit') limit?: string) {
    return this.live.messages(id, limit ? Math.min(Math.max(1, parseInt(limit, 10)), 200) : 100);
  }
}

@ApiTags('admin-live')
@ApiBearerAuth()
@Public() // global user-JWT guard skips these; AdminGuard authenticates instead
@UseGuards(AdminGuard)
@Controller('admin/live')
export class AdminLiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  adminList() {
    return this.live.adminList();
  }

  @Post(':id/end')
  adminEnd(@Param('id', ParseUUIDPipe) id: string) {
    return this.live.adminEnd(id);
  }
}
