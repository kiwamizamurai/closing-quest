import type { Category } from '@/core/accounting/accounts';
import type { GameState } from '@/core/game/types';
import { formatDateWithWeekday, type Yen } from '@/core/types';
import { el } from '@/ui/dom';

/** 帳簿の数字。負は △。単位（円）は表の見出しに書く。 */
export const fmtNum = (n: Yen): string =>
  n < 0 ? `△${Math.abs(n).toLocaleString('ja-JP')}` : n.toLocaleString('ja-JP');

/** 差額用。増は +、減は △。 */
export const fmtSigned = (n: Yen): string => (n > 0 ? `+${n.toLocaleString('ja-JP')}` : n < 0 ? fmtNum(n) : '±0');

export const CATEGORY_LABEL: Record<Category, string> = {
  asset: '資産',
  liability: '負債',
  equity: '純資産',
  revenue: '収益',
  expense: '費用',
};

export const SIDE_LABEL = { debit: '借方', credit: '貸方' } as const;

/** 各タブの先頭（表題と、何日時点かの表示）。 */
export const tabHead = (title: string, state: GameState, extra?: HTMLElement | null): HTMLElement =>
  el(
    'header',
    { class: 'cq-tab__head' },
    el('h3', { class: 'cq-tab__title', text: title }),
    el('p', { class: 'cq-tab__asof', text: `${formatDateWithWeekday(state.date)} 時点` }),
    extra,
  );

/** 「貸借一致 ✓」の表示。色だけに頼らず記号と文言で伝える。 */
export const balanceBadge = (ok: boolean, okText: string, ngText: string): HTMLElement =>
  el('p', {
    class: ok ? 'cq-badge is-ok' : 'cq-badge is-ng',
    text: ok ? `✓ ${okText}` : `✕ ${ngText}`,
    attrs: { role: 'status' },
  });
