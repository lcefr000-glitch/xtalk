import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto, EditMessageDto, SendMessageDto } from './dto/message.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller()
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('conversations')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) {
    return this.conversations.createDirect(user.id, dto.userId);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.listMine(user.id);
  }

  @Get('conversations/unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.conversations.unreadTotal(user.id);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.getMessages(user.id, id, before, limit ? parseInt(limit, 10) : 30);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversations.sendMessage(user.id, id, dto);
  }

  @Post('conversations/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.markRead(user.id, id);
  }

  @Patch('messages/:id')
  edit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditMessageDto) {
    return this.conversations.editMessage(user.id, id, dto);
  }

  @HttpCode(200)
  @Delete('messages/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.deleteMessage(user.id, id);
  }
}
