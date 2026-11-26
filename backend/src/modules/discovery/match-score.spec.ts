import { matchScore } from './discovery.service';

describe('matchScore', () => {
  const viewer = { profile: { interests: ['music', 'film'] }, userLanguages: [{ type: 'NATIVE', languageCode: 'ar' }, { type: 'LEARNING', languageCode: 'en' }] };
  it('scores a full language swap plus shared interests', () => {
    const u = { lastActiveAt: new Date(), profile: { interests: ['music', 'film'] }, userLanguages: [{ type: 'NATIVE', languageCode: 'en' }, { type: 'LEARNING', languageCode: 'ar' }] };
    expect(matchScore(viewer, u)).toBe(90);
  });
  it('scores zero for no overlap and inactive', () => {
    const u = { lastActiveAt: new Date(0), profile: { interests: [] }, userLanguages: [] };
    expect(matchScore(viewer, u)).toBe(0);
  });
});
