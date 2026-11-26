import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { AdminController } from './admin.controller';
import { AdminStoreController } from './admin-store.controller';
import { StoreModule } from '../store/store.module';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [
    StoreModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwtAccessSecret', { infer: true }),
      }),
    }),
  ],
  controllers: [AdminController, AdminStoreController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
