import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

/**
 * Thin wrapper around LiveKit (WebRTC SFU). Configure with LIVEKIT_URL (wss://...),
 * LIVEKIT_API_KEY, LIVEKIT_API_SECRET. Without them, token requests return 503.
 */
@Injectable()
export class LiveKitService {
  private readonly log = new Logger(LiveKitService.name);

  private get url() { return process.env.LIVEKIT_URL ?? ''; }
  private get key() { return process.env.LIVEKIT_API_KEY ?? ''; }
  private get secret() { return process.env.LIVEKIT_API_SECRET ?? ''; }

  get configured() { return !!(this.url && this.key && this.secret); }

  private httpUrl() { return this.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'); }

  async createToken(opts: { roomId: string; userId: string; name: string; canPublish: boolean; video?: boolean }) {
    if (!this.configured) throw new ServiceUnavailableException('Live audio is not configured (LIVEKIT_* missing)');
    const at = new AccessToken(this.key, this.secret, {
      identity: opts.userId,
      name: opts.name,
      ttl: '2h',
    });
    at.addGrant({
      room: opts.roomId,
      roomJoin: true,
      canSubscribe: true,
      canPublish: opts.canPublish,
      canPublishSources: opts.canPublish
        ? opts.video
          ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
          : [TrackSource.MICROPHONE]
        : [],
      canPublishData: false,
    });
    return { token: await at.toJwt(), url: this.url };
  }

  private client() { return new RoomServiceClient(this.httpUrl(), this.key, this.secret); }

  /** Best effort: the DB stays the source of truth, LiveKit follows. */
  private async safe(fn: () => Promise<unknown>) {
    if (!this.configured) return;
    try { await fn(); } catch (e) { this.log.warn(`LiveKit call failed: ${(e as Error).message}`); }
  }

  setCanPublish(roomId: string, userId: string, canPublish: boolean) {
    return this.safe(() =>
      this.client().updateParticipant(roomId, userId, undefined, {
        canSubscribe: true,
        canPublish,
        canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
        canPublishData: false,
      }),
    );
  }

  /** Server-side mute of the user's microphone tracks. */
  mute(roomId: string, userId: string, muted: boolean) {
    return this.safe(async () => {
      const p = await this.client().getParticipant(roomId, userId);
      for (const t of p.tracks) {
        if (t.source === TrackSource.MICROPHONE) await this.client().mutePublishedTrack(roomId, userId, t.sid, muted);
      }
    });
  }

  kick(roomId: string, userId: string) {
    return this.safe(() => this.client().removeParticipant(roomId, userId));
  }

  closeRoom(roomId: string) {
    return this.safe(() => this.client().deleteRoom(roomId));
  }
}
