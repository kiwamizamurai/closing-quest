import type { Book } from '../accounting/book';
import type { Card, CardContext, CardDef, SquareType } from '../tasks/types';
import { periodOf } from '../types';
import type { Square } from './types';

/** カード定義を実体にする。動的カードはその時点の帳簿から作る。 */
export const resolveCard = (def: CardDef, ctx: CardContext): Card =>
  typeof def === 'function' ? def(ctx) : def;

export const squareTypeOf = (card: Card): SquareType => {
  if (card.squareType) return card.squareType;
  if (card.monthClose) return 'monthend';
  if (card.kind === 'CHANCE') return 'event';
  if (card.kind === 'DEADLINE' && card.mandatory) return 'deadline';
  return 'normal';
};

/**
 * 盤面は「カードを日付順に並べたもの」。1 カード＝1 マス。
 * 動的カードは previewBook（開始残高だけの帳簿）で実体化して、日付・ラベル・種別だけを使う
 * （これらは帳簿に依存してはならない）。
 */
export const buildBoard = (defs: readonly CardDef[], previewBook: Book): Square[] => {
  const cards = defs.map((d, order) => ({ card: resolveCard(d, { book: previewBook, date: 0 }), order }));
  cards.sort((a, b) => a.card.date - b.card.date || a.order - b.order);
  return cards.map(({ card }, index) => ({
    index,
    type: squareTypeOf(card),
    period: periodOf(card.date),
    date: card.date,
    label: card.squareLabel,
    cardId: card.id,
    cardKind: card.kind,
    mandatory: card.mandatory,
  }));
};

export interface MovePlan {
  readonly to: number;
  /** 通過するマスの番号（着地マスを含む）。 */
  readonly path: readonly number[];
}

/**
 * 出目ぶん進む。ただし必須マス（期限・月末など）に着いたらそこで止まる。
 * これで「期限マスを飛び越して業務を避ける」ことができない。
 */
export const computeMove = (board: readonly Square[], position: number, roll: number): MovePlan => {
  const path: number[] = [];
  let i = position;
  for (let step = 0; step < roll; step++) {
    if (i >= board.length - 1) break;
    i += 1;
    path.push(i);
    if (board[i]?.mandatory) break;
  }
  return { to: i, path };
};
