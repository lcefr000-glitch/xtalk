import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const ENTITLEMENTS: Record<string, string[]> = {
  FREE: ['discovery', 'messaging', 'moments', 'voice_rooms', 'daily_translations_limited'],
  PREMIUM: ['discovery', 'messaging', 'moments', 'voice_rooms', 'unlimited_translations', 'unlimited_corrections', 'ai_tutor', 'advanced_filters', 'no_ads'],
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async mySubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    return sub ?? { plan: 'FREE' as const, status: 'ACTIVE' as const, expiresAt: null as Date | null };
  }

  async entitlements(userId: string) {
    const sub = await this.mySubscription(userId);
    const active = sub.status === 'ACTIVE' && (!sub.expiresAt || sub.expiresAt > new Date());
    const plan: string = active ? sub.plan : 'FREE';
    return { plan, features: ENTITLEMENTS[plan] ?? ENTITLEMENTS.FREE };
  }

  /**
   * Google Play Billing verification needs a service account
   * (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) which is not provisioned here.
   * Never record unverified purchases as PREMIUM.
   */
  async verifyGooglePlayPurchase(_userId: string, _productId: string, _purchaseToken: string) {
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
      throw new ServiceUnavailableException(
        'Google Play Billing verification not configured (set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)',
      );
    }
    // Real verification lands when credentials exist:
    // androidpublisher.purchases.subscriptions.get(...) then upsert Subscription + PaymentTransaction.
    throw new ServiceUnavailableException('Billing verification not implemented yet');
  }

  async devActivate(userId: string, tier: string) {
    if ((process.env.DEV_BILLING ?? 'on') === 'off') throw new BadRequestException('Test activation is disabled');
    const months: Record<string, number | null> = { '1m': 1, '3m': 3, '1y': 12, life: null };
    if (!(tier in months)) throw new BadRequestException('Unknown tier');
    const m = months[tier];
    const current = await this.mySubscription(userId);
    // Extend from the current expiry when VIP is still active; lifetime never expires.
    let expiresAt: Date | null = null;
    if (m !== null) {
      const base = current.plan === 'PREMIUM' && current.expiresAt && current.expiresAt > new Date() ? new Date(current.expiresAt) : new Date();
      base.setMonth(base.getMonth() + m);
      expiresAt = base;
    }
    await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: 'PREMIUM', status: 'ACTIVE', expiresAt },
      update: { plan: 'PREMIUM', status: 'ACTIVE', expiresAt },
    });
    return { ...(await this.mySubscription(userId)), testMode: true, tier };
  }

  history(userId: string) {
    return this.prisma.paymentTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
