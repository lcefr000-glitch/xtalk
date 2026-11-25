# Live voice rooms (LiveKit)

Audio goes through LiveKit (WebRTC). Free LiveKit Cloud project works for testing.
Backend env (backend/.env or .env.prod): LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
Without them the app joins rooms but shows "Live audio is not set up" (token endpoint returns 503).

Flow: join room -> POST /api/v1/voice-rooms/:id/token -> app connects to LiveKit. HOST/SPEAKER can publish the microphone;
LISTENER can only hear. Host promotes/demotes, mutes, removes, closes; the backend mirrors this to LiveKit.
Known limits: no raise-hand, no background audio service, a host-muted speaker can unmute themselves locally.
