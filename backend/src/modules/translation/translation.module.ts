import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LibreTranslateProvider } from './translation.providers';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

@Module({
  imports: [ConversationsModule],
  controllers: [TranslationController],
  providers: [TranslationService, LibreTranslateProvider],
})
export class TranslationModule {}
