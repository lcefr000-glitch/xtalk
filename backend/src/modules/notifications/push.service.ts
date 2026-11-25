import { Injectable, Logger } from '@nestjs/common';

/**
 * Push delivery abstraction. FCM credentials are not provisioned in this
 * environment, so the default provider logs. Swap `send` with a real FCM
 * implementation when google-services credentials exist (Phase 3 hardening).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  async send(userId: string, title: string, body: string, data: Record<string, string> = {}) {
    this.logger.log(`[push:log-provider] -> user ${userId}: ${title} - ${body} ${JSON.stringify(data)}`);
    return { delivered: false, provider: 'log' };
  }
}
