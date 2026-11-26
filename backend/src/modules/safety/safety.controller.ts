import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReportDto } from './dto/report.dto';
import { SafetyService } from './safety.service';

@ApiTags('safety')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('users/:id/block')
  block(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.block(user.id, id);
  }

  @HttpCode(200)
  @Delete('users/:id/block')
  unblock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.unblock(user.id, id);
  }

  @Get('users/me/blocked-countries')
  blockedCountries(@CurrentUser() user: AuthUser) {
    return this.safety.blockedCountries(user.id).then((countries) => ({ countries }));
  }

  @Put('users/me/blocked-countries')
  setBlockedCountries(@CurrentUser() user: AuthUser, @Body() body: { countries?: string[] }) {
    return this.safety.setBlockedCountries(user.id, body?.countries ?? []);
  }

  @Get('users/me/blocked')
  blocked(@CurrentUser() user: AuthUser) {
    return this.safety.blockedUsers(user.id);
  }

  @Post('reports')
  report(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.safety.report(user.id, dto);
  }
}
