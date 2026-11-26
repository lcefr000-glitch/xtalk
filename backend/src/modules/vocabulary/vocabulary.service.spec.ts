import { sm2 } from './vocabulary.service';

describe('sm2 spaced repetition', () => {
  it('first successful review schedules +1 day', () => {
    const r = sm2(5, 2.5, 0, 0);
    expect(r.intervalDays).toBe(1);
    expect(r.repetitions).toBe(1);
  });

  it('second successful review schedules +3 days', () => {
    const r = sm2(5, 2.5, 1, 1);
    expect(r.intervalDays).toBe(3);
    expect(r.repetitions).toBe(2);
  });

  it('later reviews grow by the ease factor', () => {
    const r = sm2(5, 2.5, 3, 2);
    expect(r.intervalDays).toBe(Math.ceil(3 * 2.5));
    expect(r.repetitions).toBe(3);
  });

  it('a failed review (quality < 3) resets the streak', () => {
    const r = sm2(2, 2.5, 30, 10);
    expect(r.intervalDays).toBe(0);
    expect(r.repetitions).toBe(0);
  });

  it('ease never drops below 1.3', () => {
    let ease = 2.5;
    for (let i = 0; i < 20; i++) ease = sm2(0, ease, 0, 0).ease;
    expect(ease).toBeGreaterThanOrEqual(1.3);
  });

  it('clamps out-of-range quality', () => {
    expect(sm2(99, 2.5, 0, 0).intervalDays).toBe(1);
    expect(sm2(-5, 2.5, 5, 5).repetitions).toBe(0);
  });
});
