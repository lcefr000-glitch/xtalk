import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { AdminControlController } from './admin-control.controller';
import { AdminController } from './admin.controller';
import { AdminXController } from './admin-x.controller';
import { AdminStoreController } from './admin-store.controller';
import { StoreModule } from '../store/store.module';
import { AdminGuard } from './admin.guard';
import { AppRemoteController, AdminRemoteController } from './remote.controller';
import { RemoteService } from './remote.service';
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
  controllers: [AdminController, AdminXController, AdminControlController, AdminStoreController, AppRemoteController, AdminRemoteController],
  providers: [AdminService, AdminGuard, RemoteService],
})
export class AdminModule {}
