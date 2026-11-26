import { Module } from '@nestjs/common';
import { ChatExtrasController } from './chat-extras.controller';
import { ChatExtrasService } from './chat-extras.service';

@Module({ controllers: [ChatExtrasController], providers: [ChatExtrasService] })
export class ChatExtrasModule {}
