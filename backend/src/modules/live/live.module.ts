import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { AdminGuard } from '../admin/admin.guard';
import { AdminLiveController, LiveController } from './live.controller';
import { LiveService } from './live.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwtAccessSecret', { infer: true }),
      }),
    }),
  ],
  controllers: [LiveController, AdminLiveController],
  providers: [LiveService, AdminGuard],
  exports: [LiveService],
})
export class LiveModule {}
