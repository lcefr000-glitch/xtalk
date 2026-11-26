import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.profiles.getMyProfile(user.id);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.updateMyProfile(user.id, dto);
  }

  @Get(':id')
  getProfile(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.getProfileById(user.id, id);
  }
}
