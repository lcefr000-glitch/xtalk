import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { CorrectionsController } from './corrections.controller';
import { CorrectionsService } from './corrections.service';

@Module({
  imports: [ConversationsModule],
  controllers: [CorrectionsController],
  providers: [CorrectionsService],
})
export class CorrectionsModule {}
