import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { LiveKitService } from './livekit.service';
import { VoiceService } from './voice.service';

@Module({
  controllers: [VoiceController],
  providers: [VoiceService, LiveKitService],
})
export class VoiceModule {}
