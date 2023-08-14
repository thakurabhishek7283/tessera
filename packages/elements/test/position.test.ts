import { describe, expect, it } from 'vitest';
import { computePosition } from '../src/position.js';

const viewport = { width: 1000, height: 800 };
const floating = { width: 200, height: 100 };

describe('computePosition', () => {
  it('centres below the anchor by default', () => {
    const r = computePosition({
      anchor: { x: 400, y: 100, width: 100, height: 40 },
      floating,
      viewport,
    });
    expect(r).toEqual({ placement: 'bottom', x: 350, y: 146 });
  });

  it('supports start and end alignment on every side', () => {
    const anchor = { x: 400, y: 300, width: 100, height: 40 };
    expect(
      computePosition({ anchor, floating, viewport, placement: 'bottom-start' }),
    ).toMatchObject({ x: 400, y: 346 });
    expect(computePosition({ anchor, floating, viewport, placement: 'bottom-end' })).toMatchObject({
      x: 300,
      y: 346,
    });
    expect(computePosition({ anchor, floating, viewport, placement: 'top' })).toMatchObject({
      x: 350,
      y: 194,
    });
    expect(computePosition({ anchor, floating, viewport, placement: 'right' })).toMatchObject({
      x: 506,
      y: 270,
    });
    expect(computePosition({ anchor, floating, viewport, placement: 'left-start' })).toMatchObject({
      x: 194,
      y: 300,
    });
  });

  it('flips to the top when there is no room below', () => {
    const r = computePosition({
      anchor: { x: 400, y: 740, width: 100, height: 40 },
      floating,
      viewport,
    });
    expect(r.placement).toBe('top');
    expect(r.y).toBe(740 - 100 - 6);
  });

  it('keeps the preferred side when both sides overflow but it has more room', () => {
    const r = computePosition({
      anchor: { x: 0, y: 20, width: 50, height: 20 },
      floating: { width: 100, height: 900 },
      viewport,
    });
    expect(r.placement).toBe('bottom');
  });

  it('shifts along the cross axis to stay inside the viewport', () => {
    const left = computePosition({
      anchor: { x: 0, y: 100, width: 40, height: 40 },
      floating,
      viewport,
    });
    expect(left.x).toBe(8);
    const right = computePosition({
      anchor: { x: 980, y: 100, width: 20, height: 40 },
      floating,
      viewport,
    });
    expect(right.x).toBe(1000 - 200 - 8);
    const side = computePosition({
      anchor: { x: 400, y: 780, width: 40, height: 20 },
      floating,
      viewport,
      placement: 'right',
    });
    expect(side.y).toBe(800 - 100 - 8);
  });

  it('flips left/right too', () => {
    const r = computePosition({
      anchor: { x: 900, y: 300, width: 80, height: 40 },
      floating,
      viewport,
      placement: 'right',
    });
    expect(r.placement).toBe('left');
  });
});
