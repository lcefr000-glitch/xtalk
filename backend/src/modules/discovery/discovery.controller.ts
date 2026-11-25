import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DiscoveryService } from './discovery.service';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';

@ApiTags('discovery')
@ApiBearerAuth()
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() query: DiscoveryQueryDto) {
    return this.discovery.search(user.id, query);
  }

  @Get('recommendations')
  recommendations(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.discovery.recommendations(user.id, limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20);
  }
}
