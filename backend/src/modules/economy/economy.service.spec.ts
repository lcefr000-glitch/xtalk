import { levelFor, spentForLevel } from './economy.service';

describe('levels', () => {
  it('starts at 1 and rises with spending', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(49)).toBe(1);
    expect(levelFor(50)).toBe(2);
    expect(levelFor(200)).toBe(3);
    expect(levelFor(450)).toBe(4);
  });
  it('threshold helper matches', () => {
    expect(spentForLevel(1)).toBe(0);
    expect(spentForLevel(3)).toBe(200);
    expect(levelFor(spentForLevel(7))).toBe(7);
  });
});
