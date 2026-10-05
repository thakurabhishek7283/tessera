import { html, LitElement } from 'lit';

class TesseraElement extends LitElement {}
declare function defineElement(tag: string, ctor: CustomElementConstructor): void;

export type Density = 'compact' | 'comfortable';
export type Side = 'top' | 'bottom';
export type Edge = Side | `${Side}-start`;

/**
 * A board with columns of cards.
 *
 * @fires {CustomEvent<{ id: string }>} card-move - after a card moved
 * @slot toolbar - extra controls
 * @csspart header - the board header
 * @cssprop --fixture-board-gap - space between columns
 *
 * @tessera-display Board
 * @tessera-icon columns
 * @tessera-span 12 md:6 lg:4 min-height:420px
 * @tessera-container
 * @tessera-expose selected {string} - The selected card id.
 * @tessera-expose lastMoved {Card} from event:card-move detail.card - The card that moved last.
 * @tessera-method scrollTo(id: string, smooth?: boolean): void - Scrolls a card into view.
 * @tessera-method count(): number
 * @tessera-editor notes textarea
 * @tessera-editor tone select calm,loud
 * @tessera-group density appearance
 */
export class FixtureBoard extends TesseraElement {
  static override properties = {
    boardId: { attribute: 'board-id' },
    density: { reflect: true },
    edge: {},
    columns: { attribute: false },
    readonly: { type: Boolean },
    limit: { type: Number },
    notes: {},
    tone: {},
    selected: {},
    filter: { attribute: false },
    hover: { state: true },
  };
  static tesseraExposes = ['selected'] as const;
  static formAssociated = true;

  /** The board to show. */
  boardId = '';
  density: Density = 'comfortable';
  edge: Edge = 'top';
  columns: string[] = [];
  readonly = false;
  limit = 10;
  notes = '';
  tone = 'calm';
  selected?: string;
  filter?: (card: unknown) => boolean;
  hover = false;
  /** Not reactive: never in the manifest. */
  plain = 1;
  private secret = 2;

  protected override render() {
    return html`<header part="header title"><slot name="toolbar"></slot></header>
      <div part="columns">${this.columns.map((c) => html`<section part="column">${c}</section>`)}</div>
      <slot></slot>`;
  }

  scrollTo(_id: string): void {}

  protected moved(): void {
    this.emit('card-move', { id: 'x' });
    this.emit('board-change', {});
  }

  private emit(_name: string, _detail: unknown): void {}
}

/** @tessera-icon note */
export class FixtureCard extends FixtureBoard {
  static override properties = { ...FixtureBoard.properties, title: {} };
  title = '';
}

export class FixtureInternal extends TesseraElement {}

defineElement('fixture-board', FixtureBoard);
customElements.define('fixture-card', FixtureCard);
defineElement('fixture-internal', FixtureInternal);
