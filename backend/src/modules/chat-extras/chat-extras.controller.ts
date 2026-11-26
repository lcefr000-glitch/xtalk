import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatExtrasService } from './chat-extras.service';

class ReactDto {
  @IsString()
  @MaxLength(16)
  emoji!: string;
}

@ApiTags('chat-extras')
@ApiBearerAuth()
@Controller('chat-extras')
export class ChatExtrasController {
  constructor(private readonly extras: ChatExtrasService) {}

  @Post('messages/:id/react')
  @HttpCode(200)
  react(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReactDto) {
    return this.extras.react(user.id, id, dto.emoji);
  }

  @Get('conversations/:id/reactions')
  reactions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.forConversation(user.id, id);
  }

  @Get('pins')
  pins(@CurrentUser() user: AuthUser) {
    return this.extras.pins(user.id);
  }

  @Post('pins/:id')
  @HttpCode(200)
  togglePin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.extras.togglePin(user.id, id);
  }
}
