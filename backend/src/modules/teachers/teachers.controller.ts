import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin/admin.guard';
import { CreateBookingDto, ReviewDto, UpsertTeacherProfileDto, VerifyTeacherDto } from './dto/teachers.dto';
import { TeachersService } from './teachers.service';

@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  search(
    @Query('language') language?: string,
    @Query('verified') verified?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teachers.search({
      language,
      verifiedOnly: verified === 'true',
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      limit: limit ? Math.min(Math.max(1, parseInt(limit, 10)), 50) : 20,
    });
  }

  /** Become a teacher / update the signed-in user's teacher profile. */
  @Put('me')
  upsertMe(@CurrentUser() user: AuthUser, @Body() dto: UpsertTeacherProfileDto) {
    return this.teachers.upsertProfile(user.id, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.teachers.profile(user.id);
  }

  @Get('me/bookings')
  myTeacherBookings(@CurrentUser() user: AuthUser) {
    return this.teachers.myBookings(user.id, 'teacher');
  }

  @Get(':id')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.profile(id);
  }

  @Get(':id/reviews')
  reviews(@Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.teachers.reviews(id, page ? Math.max(1, parseInt(page, 10)) : 1, limit ? Math.min(Math.max(1, parseInt(limit, 10)), 50) : 20);
  }

  @Post(':id/bookings')
  book(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBookingDto) {
    return this.teachers.book(user.id, id, new Date(dto.startsAt), dto.durationMin, dto.note);
  }
}

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly teachers: TeachersService) {}

  @Get('me')
  myBookings(@CurrentUser() user: AuthUser) {
    return this.teachers.myBookings(user.id, 'student');
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.confirm(user.id, id);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.decline(user.id, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.cancel(user.id, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.complete(user.id, id);
  }

  @Post(':id/review')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.teachers.review(user.id, id, dto.rating, dto.feedback);
  }
}

@ApiTags('admin-teachers')
@ApiBearerAuth()
@Public() // global user-JWT guard skips these; AdminGuard authenticates instead
@UseGuards(AdminGuard)
@Controller('admin/teachers')
export class AdminTeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  adminList() {
    return this.teachers.adminList();
  }

  @Post(':id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyTeacherDto) {
    return this.teachers.setVerified(id, dto.verified);
  }
}
