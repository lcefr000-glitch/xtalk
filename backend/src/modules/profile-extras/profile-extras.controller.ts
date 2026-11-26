import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfileExtrasService } from './profile-extras.service';

class ExtrasDto {
  @IsOptional() @IsString() @MaxLength(80) hometown?: string;
  @IsOptional() @IsString() @MaxLength(80) occupation?: string;
  @IsOptional() @IsString() @MaxLength(80) school?: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() @MaxLength(4) mbti?: string;
  @IsOptional() @IsString() @MaxLength(3) bloodType?: string;
  @IsOptional() @IsString() @MaxLength(120) tagline?: string;
  /** Read-only on this route (use PUT me/cover); accepted so a round-tripped profile does not fail validation. */
  @IsOptional() @IsString() coverUrl?: string;
}

class CoverDto {
  @IsString()
  coverUrl!: string;
}

class WishlistDto {
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  giftIds!: string[];
}

@ApiTags('profile-extras')
@ApiBearerAuth()
@Controller('profile-extras')
export class ProfileExtrasController {
  constructor(private readonly extras: ProfileExtrasService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.extras.get(user.id);
  }

  @Put('me')
  save(@CurrentUser() user: AuthUser, @Body() dto: ExtrasDto) {
    return this.extras.save(user.id, dto);
  }

  @Put('me/cover')
  setCover(@CurrentUser() user: AuthUser, @Body() dto: CoverDto) {
    return this.extras.setCover(user.id, dto.coverUrl);
  }

  @Put('me/wishlist')
  setWishlist(@CurrentUser() user: AuthUser, @Body() dto: WishlistDto) {
    return this.extras.setWishlist(user.id, dto.giftIds);
  }

  @Get(':userId/wishlist')
  wishlist(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.extras.wishlistOf(user.id, userId);
  }

  @Get(':userId')
  one(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.extras.getFor(user.id, userId);
  }

  @Get(':userId/posts')
  posts(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    return this.extras.postsOf(user.id, userId, before, limit ? parseInt(limit, 10) : 20);
  }

  @Get(':userId/honor')
  honor(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.extras.honorOf(user.id, userId);
  }
}
