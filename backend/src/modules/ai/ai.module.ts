import { Global, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiClient } from './gemini.client';

@Global()
@Module({
  controllers: [AiController],
  providers: [AiService, GeminiClient],
  exports: [GeminiClient, AiService],
})
export class AiModule {}
