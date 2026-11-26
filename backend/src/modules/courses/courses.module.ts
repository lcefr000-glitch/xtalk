import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';
import { AdminGuard } from '../admin/admin.guard';
import { ProgressModule } from '../progress/progress.module';
import { AdminCoursesController, CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [
    ProgressModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwtAccessSecret', { infer: true }),
      }),
    }),
  ],
  controllers: [CoursesController, AdminCoursesController],
  providers: [CoursesService, AdminGuard],
  exports: [CoursesService],
})
export class CoursesModule {}
