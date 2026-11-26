import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateRoomDto, RoomRoleDto, RoomThemeDto, RoomUserDto, StartCallDto } from './dto/voice.dto';
import { VoiceService } from './voice.service';

@ApiTags('voice')
@ApiBearerAuth()
@Controller()
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('voice-rooms')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto) {
    return this.voice.createRoom(user.id, dto);
  }

  @Get('voice-rooms')
  list(@Query('live') live?: string) {
    return this.voice.listRooms(live !== 'false');
  }

  @Get('voice-rooms/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.voice.getRoom(id);
  }

  @Post('voice-rooms/:id/join')
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.joinRoom(user.id, id);
  }

  @Post('voice-rooms/:id/token')
  token(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.getToken(user.id, id);
  }

  @Post('voice-rooms/:id/stage/request')
  requestStage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.requestStage(user.id, id);
  }

  @Post('voice-rooms/:id/stage/cancel')
  cancelStage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.cancelStageRequest(user.id, id);
  }

  @Post('voice-rooms/:id/stage/reject')
  rejectStage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomUserDto) {
    return this.voice.rejectStage(user.id, id, dto.userId);
  }

  @Post('voice-rooms/:id/theme')
  setTheme(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomThemeDto) {
    return this.voice.setTheme(user.id, id, dto.theme);
  }

  @Post('voice-rooms/:id/moderators/add')
  addMod(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomUserDto) {
    return this.voice.setModerator(user.id, id, dto.userId, true);
  }

  @Post('voice-rooms/:id/moderators/remove')
  removeMod(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomUserDto) {
    return this.voice.setModerator(user.id, id, dto.userId, false);
  }

  @Post('voice-rooms/:id/seat/leave')
  leaveSeat(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.leaveSeat(user.id, id);
  }

  @Post('voice-rooms/:id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.leaveRoom(user.id, id);
  }

  @Post('voice-rooms/:id/role')
  role(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomRoleDto) {
    return this.voice.setRole(user.id, id, dto.userId, dto.role);
  }

  @Post('voice-rooms/:id/mute')
  mute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomUserDto) {
    return this.voice.setMuted(user.id, id, dto.userId, true);
  }

  @Post('voice-rooms/:id/unmute')
  unmute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomUserDto) {
    return this.voice.setMuted(user.id, id, dto.userId, false);
  }

  @Post('voice-rooms/:id/remove')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomUserDto) {
    return this.voice.removeParticipant(user.id, id, dto.userId);
  }

  @Post('voice-rooms/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.closeRoom(user.id, id);
  }

  @Post('calls')
  startCall(@CurrentUser() user: AuthUser, @Body() dto: StartCallDto) {
    return this.voice.startCall(user.id, dto);
  }

  @Post('calls/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.acceptCall(user.id, id);
  }

  @Post('calls/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.rejectCall(user.id, id);
  }

  @Post('calls/:id/end')
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.endCall(user.id, id);
  }

  @Get('calls/history')
  history(@CurrentUser() user: AuthUser) {
    return this.voice.callHistory(user.id);
  }

  /** LiveKit media token for a call either party is in (ringing or ongoing). */
  @Post('calls/:id/token')
  callToken(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voice.callToken(user.id, id);
  }
}
