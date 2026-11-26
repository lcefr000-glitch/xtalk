import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProgressService } from './progress.service';

class ActivityDto {
  @IsOptional() @IsInt() @Min(0) @Max(86_400) practiceSeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) wordsSaved?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) messagesSent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000) lessonsCompleted?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) reviewsDone?: number;
}

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.progress.me(user.id);
  }

  /** Client-reported practice activity (e.g. time spent in a lesson or voice room). */
  @Post('activity')
  async activity(@CurrentUser() user: AuthUser, @Body() dto: ActivityDto) {
    const unlocked = await this.progress.record(user.id, dto);
    return { success: true, newlyUnlocked: unlocked };
  }

  @Post('check-achievements')
  async check(@CurrentUser() user: AuthUser) {
    const unlocked = await this.progress.checkAchievements(user.id);
    return { success: true, newlyUnlocked: unlocked };
  }
}
