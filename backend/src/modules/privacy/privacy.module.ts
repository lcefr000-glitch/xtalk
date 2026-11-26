import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrivacyController } from './privacy.controller';
import { PrivacyInterceptor } from './privacy.interceptor';
import { PrivacyService } from './privacy.service';

@Global()
@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService, { provide: APP_INTERCEPTOR, useClass: PrivacyInterceptor }],
  exports: [PrivacyService],
})
export class PrivacyModule {}
