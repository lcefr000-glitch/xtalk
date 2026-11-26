import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { FriendsService } from './friends.service';

class SendRequestDto {
  @IsUUID() @IsNotEmpty() userId!: string;
}

@ApiTags('friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Post('requests')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendRequestDto) {
    return this.friends.send(user.id, dto.userId);
  }

  @Get('requests/incoming')
  incoming(@CurrentUser() user: AuthUser) {
    return this.friends.incoming(user.id);
  }

  @Get('requests/outgoing')
  outgoing(@CurrentUser() user: AuthUser) {
    return this.friends.outgoing(user.id);
  }

  @Post('requests/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.accept(user.id, id);
  }

  @Post('requests/:id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.decline(user.id, id);
  }

  @Delete('requests/:id')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.friends.cancel(user.id, id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.friends(user.id);
  }

  @Get('status/:userId')
  status(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) otherId: string) {
    return this.friends.status(user.id, otherId);
  }

  @Delete(':userId')
  unfriend(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) otherId: string) {
    return this.friends.unfriend(user.id, otherId);
  }
}
