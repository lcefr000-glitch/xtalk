import { Module } from '@nestjs/common';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { StoreModule } from '../store/store.module';

@Module({ imports: [StoreModule], controllers: [EconomyController], providers: [EconomyService] })
export class EconomyModule {}
