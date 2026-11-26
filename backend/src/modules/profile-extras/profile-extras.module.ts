import { Module } from '@nestjs/common';
import { ProfileExtrasController } from './profile-extras.controller';
import { ProfileExtrasService } from './profile-extras.service';

@Module({ controllers: [ProfileExtrasController], providers: [ProfileExtrasService] })
export class ProfileExtrasModule {}
