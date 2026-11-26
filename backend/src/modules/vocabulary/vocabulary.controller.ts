import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCollectionDto, ReviewDto, SaveItemDto, UpdateItemDto } from './dto/vocabulary.dto';
import { VocabularyService } from './vocabulary.service';

@ApiTags('vocabulary')
@ApiBearerAuth()
@Controller('vocab')
export class VocabularyController {
  constructor(private readonly vocab: VocabularyService) {}

  @Get('collections')
  collections(@CurrentUser() user: AuthUser) {
    return this.vocab.collections(user.id);
  }

  @Post('collections')
  createCollection(@CurrentUser() user: AuthUser, @Body() dto: CreateCollectionDto) {
    return this.vocab.createCollection(user.id, dto.name, dto.languageCode);
  }

  @Delete('collections/:id')
  deleteCollection(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vocab.deleteCollection(user.id, id);
  }

  @Get('items')
  list(
    @CurrentUser() user: AuthUser,
    @Query('language') language?: string,
    @Query('collectionId') collectionId?: string,
    @Query('q') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.vocab.list(user.id, {
      language,
      collectionId,
      search,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      limit: limit ? Math.min(Math.max(1, parseInt(limit, 10)), 100) : 50,
    });
  }

  @Post('items')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveItemDto) {
    return this.vocab.save(user.id, dto);
  }

  @Patch('items/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    return this.vocab.update(user.id, id, dto);
  }

  @Delete('items/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vocab.remove(user.id, id);
  }

  @Get('review/due')
  due(@CurrentUser() user: AuthUser, @Query('limit') limit?: string, @Query('language') language?: string) {
    return this.vocab.due(user.id, limit ? Math.min(Math.max(1, parseInt(limit, 10)), 100) : 20, language);
  }

  @Post('items/:id/review')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.vocab.review(user.id, id, dto.quality);
  }

  @Get('quiz')
  quiz(@CurrentUser() user: AuthUser, @Query('language') language?: string, @Query('count') count?: string) {
    return this.vocab.quiz(user.id, language, count ? Math.min(Math.max(1, parseInt(count, 10)), 20) : 10);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.vocab.stats(user.id);
  }
}
