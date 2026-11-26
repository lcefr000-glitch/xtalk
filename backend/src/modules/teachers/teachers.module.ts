import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { AdminGuard } from '../admin/admin.guard';
import { AdminTeachersController, BookingsController, TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwtAccessSecret', { infer: true }),
      }),
    }),
  ],
  controllers: [TeachersController, BookingsController, AdminTeachersController],
  providers: [TeachersService, AdminGuard],
  exports: [TeachersService],
})
export class TeachersModule {}
