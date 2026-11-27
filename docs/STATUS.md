# X Talk status: done vs needs keys

Last updated with app v54 (0.54.0). Nothing here is claimed as device-tested unless it says so.

## Built and in the code
- Accounts, profiles, languages (native/learning), country lock, VIP and levels.
- Discovery: partner search and recommendations with a 0-100 match score and reason codes (language swap, shared interests, recently active), wave button, follow.
- Chat: text, voice clips, images, reactions, corrections ("fix"), pins, stars, mute/archive, message search (server `GET /chat-extras/search`, UI in the chats tab).
- Voice rooms: public/private, host, moderators, up to 10 seats, stage requests/invites, gifts, room chat with join/leave notices, one open room per host, auto-close when host and moderators are gone, 5-minute sweep of empty/duplicate rooms, minimized floating square.
- Live: host video/audio via LiveKit, viewers, stage invites, full-screen video, chat.
- Moments: posts, filters, hashtags, corrections.
- Visitors strip, profile photo and cover crop/preview, full-screen photo viewer.
- Admin panel and ControlModule emergency controls.

## Needs keys or decisions (not faked)
| Item | Needs |
|---|---|
| Push notifications | Firebase project and server key |
| Google Play Billing | Play Console products and service account |
| Instant translation, AI tutor, grammar/writing correction, speech-to-text, pronunciation scoring | A provider and API key per capability |
| Live replay | Object storage and a recording decision |

## Not built yet
- Video and file messages, delivery/read status in the chat bubble, group chat polish.
- Daily challenges and streak screens, learning goals and levels onboarding.
- Moments mentions, voice posts, topic picker.
- Favourites and search history in discovery.
- Automated test coverage beyond the match-score spec.

## Deploy
Backend: push to `main`, the host rebuilds in about 100 seconds. Required environment variables are listed in `backend/.env.example`. Android: `./gradlew bundleRelease` signed with the release keystore (not in the repo).
