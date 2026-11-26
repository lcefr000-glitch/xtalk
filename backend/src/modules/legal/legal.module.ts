import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { LegalController } from './legal.controller';

@Module({ imports: [UsersModule], controllers: [LegalController] })
export class LegalModule {}
