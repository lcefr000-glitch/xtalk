import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShopService } from './shop.service';
import { SHOP_ITEMS } from './shop.catalog';

class ItemDto { @IsString() itemId!: string; }
class KindDto { @IsIn(['FRAME', 'BUBBLE', 'MIC']) kind!: 'FRAME' | 'BUBBLE' | 'MIC'; }
class IdsDto { @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) ids!: string[]; }

@ApiTags('shop')
@ApiBearerAuth()
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('catalog') catalog(@CurrentUser() u: AuthUser) { return this.shop.catalog(u.id); }
  @Post('buy') @HttpCode(200) buy(@CurrentUser() u: AuthUser, @Body() d: ItemDto) { return this.shop.buy(u.id, d.itemId); }
  @Post('equip') @HttpCode(200) equip(@CurrentUser() u: AuthUser, @Body() d: ItemDto) { return this.shop.equip(u.id, d.itemId); }
  @Post('unequip') @HttpCode(200) unequip(@CurrentUser() u: AuthUser, @Body() d: KindDto) { return this.shop.unequip(u.id, d.kind); }
  @Post('equipped') @HttpCode(200) equipped(@Body() d: IdsDto) { return this.shop.equippedFor(d.ids); }
}
