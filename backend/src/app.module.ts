import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configuration } from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { HealthModule } from './modules/health/health.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { FollowsModule } from './modules/follows/follows.module';
import { SafetyModule } from './modules/safety/safety.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TranslationModule } from './modules/translation/translation.module';
import { CorrectionsModule } from './modules/corrections/corrections.module';
import { PostsModule } from './modules/posts/posts.module';
import { VoiceModule } from './modules/voice/voice.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { EconomyModule } from './modules/economy/economy.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // 100 requests / minute / IP global default; auth routes override tighter limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    LanguagesModule,
    HealthModule,
    DiscoveryModule,
    FollowsModule,
    SafetyModule,
    ConversationsModule,
    NotificationsModule,
    TranslationModule,
    CorrectionsModule,
    PostsModule,
    VoiceModule,
    SubscriptionsModule,
    EconomyModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // global; routes opt out via @Public()
  ],
})
export class AppModule {}
