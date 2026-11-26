import { Controller, Get, Global, Module } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ControlService } from './control.service';

/** Public, unauthenticated: the app reads this at launch. */
@Public()
@Controller('app')
export class AppStatusController {
  constructor(private readonly control: ControlService) {}

  @Public()
  @Get('status')
  async status() {
    const s = await this.control.state();
    return { locked: s.lockdown, message: s.message, minVersionCode: s.minVersionCode };
  }
}

@Global()
@Module({ controllers: [AppStatusController], providers: [ControlService], exports: [ControlService] })
export class ControlModule {}
