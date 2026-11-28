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
    return new VoiceService(prisma, {} as any, new LiveKitService(), { send: async () => ({}) } as any);
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

describe('stage requests + moderators', () => {
  const mkRoom = (desc: string | null = null) => ({
    id: 'r1', hostId: 'h', isLive: true, description: desc,
    participants: [
      { id: 'p0', userId: 'h', role: 'HOST', isMuted: false, user: { username: 'h', profile: null } },
      { id: 'p1', userId: 'l1', role: 'LISTENER', isMuted: false, user: { username: 'l1', profile: null } },
      { id: 'p2', userId: 'm1', role: 'LISTENER', isMuted: false, user: { username: 'm1', profile: null } },
    ],
  });
  const mk = (r: any) => {
    const prisma: any = {
      voiceRoom: { findUnique: jest.fn().mockResolvedValue(r), update: jest.fn() },
      voiceRoomParticipant: { updateMany: jest.fn() },
    };
    const lk: any = { setCanPublish: jest.fn(), mute: jest.fn(), kick: jest.fn() };
    return { svc: new VoiceService(prisma, {} as any, lk, { send: async () => ({}) } as any), prisma, lk };
  };

  it('listener request shows in room, host accepts, queue clears', async () => {
    const { svc, lk } = mk(mkRoom());
    await svc.requestStage('l1', 'r1');
    expect((await svc.getRoom('r1')).stageRequests).toEqual(['l1']);
    await svc.setRole('h', 'r1', 'l1', 'SPEAKER');
    expect((await svc.getRoom('r1')).stageRequests).toEqual([]);
    expect(lk.setCanPublish).toHaveBeenCalledWith('r1', 'l1', true);
  });
  it('listener cannot seat himself or others', async () => {
    const { svc } = mk(mkRoom());
    await expect(svc.setRole('l1', 'r1', 'l1', 'SPEAKER')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('moderator from description can accept but not remove host', async () => {
    const { svc } = mk(mkRoom('Hello\n\u200b#mods:m1'));
    const r = await svc.getRoom('r1');
    expect(r.moderatorIds).toEqual(['m1']);
    expect(r.description).toBe('Hello');
    await svc.setRole('m1', 'r1', 'l1', 'SPEAKER');
    await expect(svc.removeParticipant('m1', 'r1', 'h')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('only host adds moderators and tag is stored', async () => {
    const { svc, prisma } = mk(mkRoom('Hello'));
    await expect(svc.setModerator('l1', 'r1', 'm1', true)).rejects.toBeInstanceOf(ForbiddenException);
    await svc.setModerator('h', 'r1', 'm1', true);
    expect(prisma.voiceRoom.update.mock.calls[0][0].data.description).toBe('Hello\n\u200b#mods:m1');
  });
});
