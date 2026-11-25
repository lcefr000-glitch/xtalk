import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { LiveKitService } from './livekit.service';
import { VoiceService } from './voice.service';

function room(role: string, isMuted = false, live = true) {
  return {
    id: 'r1', hostId: 'h', isLive: live,
    participants: [{ userId: 'u1', role, isMuted, user: { username: 'u', profile: { displayName: 'U One' } } }],
  };
}

describe('VoiceService.getToken / LiveKit', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const mk = (r: any) => {
    const prisma: any = { voiceRoom: { findUnique: jest.fn().mockResolvedValue(r) } };
    return new VoiceService(prisma, {} as any, new LiveKitService());
  };
  const cfg = () => {
    process.env.LIVEKIT_URL = 'wss://x.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'APIkey123';
    process.env.LIVEKIT_API_SECRET = 'secretsecretsecretsecretsecret123456';
  };
  const grants = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

  it('listener token cannot publish', async () => {
    cfg();
    const res = await mk(room('LISTENER')).getToken('u1', 'r1');
    expect(res.canPublish).toBe(false);
    const p = grants(res.token);
    expect(p.video.canPublish).toBe(false);
    expect(p.video.room).toBe('r1');
    expect(p.sub).toBe('u1');
  });
  it('speaker token can publish microphone only', async () => {
    cfg();
    const p = grants((await mk(room('SPEAKER')).getToken('u1', 'r1')).token);
    expect(p.video.canPublish).toBe(true);
    expect(p.video.canPublishSources).toEqual(['microphone']);
  });
  it('host-muted speaker gets listen-only token', async () => {
    cfg();
    expect((await mk(room('SPEAKER', true)).getToken('u1', 'r1')).canPublish).toBe(false);
  });
  it('non-participant is refused', async () => {
    cfg();
    await expect(mk(room('LISTENER')).getToken('other', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('closed room is refused', async () => {
    cfg();
    await expect(mk(room('HOST', false, false)).getToken('u1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('503 when LiveKit not configured', async () => {
    delete process.env.LIVEKIT_URL;
    await expect(mk(room('HOST')).getToken('u1', 'r1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
