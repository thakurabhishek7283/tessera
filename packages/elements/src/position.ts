export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Placement = Side | `${Side}-start` | `${Side}-end`;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionInput {
  anchor: Rect;
  floating: { width: number; height: number };
  viewport: { width: number; height: number };
  placement?: Placement;
  /** Gap between anchor and floating element. */
  offset?: number;
  /** Minimum distance kept from the viewport edge. */
  padding?: number;
}

export interface PositionResult {
  x: number;
  y: number;
  /** The placement actually used after flipping. */
  placement: Placement;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function place(input: Required<PositionInput>, placement: Placement): { x: number; y: number } {
  const { anchor: a, floating: f, offset } = input;
  const [side, align = 'center'] = placement.split('-') as [Side, ('start' | 'end')?];
  const crossX =
    align === 'start'
      ? a.x
      : align === 'end'
        ? a.x + a.width - f.width
        : a.x + (a.width - f.width) / 2;
  const crossY =
    align === 'start'
      ? a.y
      : align === 'end'
        ? a.y + a.height - f.height
        : a.y + (a.height - f.height) / 2;
  switch (side) {
    case 'top':
      return { x: crossX, y: a.y - f.height - offset };
    case 'bottom':
      return { x: crossX, y: a.y + a.height + offset };
    case 'left':
      return { x: a.x - f.width - offset, y: crossY };
    case 'right':
      return { x: a.x + a.width + offset, y: crossY };
  }
}

/** Room left on the main axis for `side`; negative means it overflows the viewport. */
function slack(input: Required<PositionInput>, side: Side): number {
  const { x, y } = place(input, side);
  const { floating: f, viewport: v, padding } = input;
  switch (side) {
    case 'top':
      return y - padding;
    case 'bottom':
      return v.height - padding - (y + f.height);
    case 'left':
      return x - padding;
    case 'right':
      return v.width - padding - (x + f.width);
  }
}

/**
 * Places a floating element next to an anchor. Flips to the opposite side when the preferred side
 * overflows and the other one fits better, then shifts along the cross axis to stay on screen.
 * Pure function so it can be tested without a browser.
 */
export function computePosition(raw: PositionInput): PositionResult {
  const input: Required<PositionInput> = { placement: 'bottom', offset: 6, padding: 8, ...raw };
  const [side, align] = input.placement.split('-') as [Side, ('start' | 'end')?];

  let used: Side = side;
  if (slack(input, side) < 0 && slack(input, OPPOSITE[side]) > slack(input, side))
    used = OPPOSITE[side];
  const placement = (align ? `${used}-${align}` : used) as Placement;

  const { x, y } = place(input, placement);
  const { floating: f, viewport: v, padding } = input;
  const clamp = (value: number, size: number, max: number): number =>
    Math.max(padding, Math.min(value, max - size - padding));
  const vertical = used === 'top' || used === 'bottom';
  return {
    placement,
    x: vertical ? clamp(x, f.width, v.width) : x,
    y: vertical ? y : clamp(y, f.height, v.height),
  };
}
