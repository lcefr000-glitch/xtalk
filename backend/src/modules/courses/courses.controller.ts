import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin/admin.guard';
import { CoursesService } from './courses.service';
import { CompleteLessonDto, UpsertCourseDto, UpsertLessonDto } from './dto/courses.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('language') language?: string,
    @Query('level') level?: string,
    @Query('q') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.courses.list(user.id, {
      language,
      level,
      search,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      limit: limit ? Math.min(Math.max(1, parseInt(limit, 10)), 50) : 20,
    });
  }

  @Get('me/enrollments')
  myEnrollments(@CurrentUser() user: AuthUser) {
    return this.courses.myEnrollments(user.id);
  }

  @Get('me/bookmarks')
  myBookmarks(@CurrentUser() user: AuthUser) {
    return this.courses.myBookmarks(user.id);
  }

  @Get('me/history')
  myHistory(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.courses.myHistory(user.id, limit ? Math.min(Math.max(1, parseInt(limit, 10)), 100) : 30);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.detail(user.id, id);
  }

  @Post(':id/enroll')
  enroll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.enroll(user.id, id);
  }

  @Delete(':id/enroll')
  unenroll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.unenroll(user.id, id);
  }

  @Get('lessons/:lessonId')
  lesson(@CurrentUser() user: AuthUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.courses.lesson(user.id, lessonId);
  }

  @Post('lessons/:lessonId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() dto: CompleteLessonDto) {
    return this.courses.completeLesson(user.id, lessonId, dto.score);
  }

  @Post('lessons/:lessonId/bookmark')
  bookmark(@CurrentUser() user: AuthUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.courses.toggleBookmark(user.id, lessonId);
  }
}

/** Course authoring lives under /admin and requires an admin token (AdminGuard). */
@ApiTags('admin-courses')
@ApiBearerAuth()
@Public() // global user-JWT guard skips these; AdminGuard authenticates instead
@UseGuards(AdminGuard)
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  adminList() {
    return this.courses.adminList();
  }

  @Post()
  create(@Body() dto: UpsertCourseDto) {
    return this.courses.upsertCourse('admin', dto);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertCourseDto) {
    return this.courses.upsertCourse('admin', dto, id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.courses.deleteCourse(id);
  }

  @Post(':id/lessons')
  createLesson(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertLessonDto) {
    return this.courses.upsertLesson(dto, id);
  }

  @Put(':id/lessons/:lessonId')
  updateLesson(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() dto: UpsertLessonDto) {
    return this.courses.upsertLesson(dto, id, lessonId);
  }

  @Delete(':id/lessons/:lessonId')
  removeLesson(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.courses.deleteLesson(id, lessonId);
  }
}
