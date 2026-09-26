import './books.css';
import type { GameStore } from '@/core/game/types';
import { el } from '@/ui/dom';
import { EV_BOOKS_STATE, EV_TOGGLE_BOOKS, type BooksStateDetail } from '@/ui/shell/events';
import { isEditableTarget } from '@/ui/shell/keys';
import { createBalanceTab } from './balance';
import { createChartTab } from './chart';
import { createIncomeTab } from './income';
import { createLedgerTab } from './ledger';
import type { BooksTab } from './tab';
import { createTrialTab } from './trial';

interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly tab: BooksTab;
}

/**
 * 帳簿ドロワー。左側に紙色のパネルで、試算表・損益計算書・貸借対照表・総勘定元帳・勘定科目表を見せる。
 * 開いている間もカードの操作はできる（ドロワー以外は pointer-events:none）。
 * B キーまたは document の 'cq:toggle-books' イベントで開閉、Esc で閉じる。
 */
export function createBooksDrawer(store: GameStore): {
  el: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
} {
  const defs: TabDef[] = [
    { id: 'trial', label: '試算表', tab: createTrialTab(store) },
    { id: 'income', label: '損益計算書', tab: createIncomeTab(store) },
    { id: 'balance', label: '貸借対照表', tab: createBalanceTab(store) },
    { id: 'ledger', label: '総勘定元帳', tab: createLedgerTab(store) },
    { id: 'chart', label: '勘定科目表', tab: createChartTab() },
  ];

  let isOpen = false;
  let active = 0;
  let prevFocus: HTMLElement | null = null;

  // タブ
  const tabButtons = defs.map((d, i) =>
    el('button', {
      class: 'cq-books__tab',
      text: d.label,
      attrs: {
        type: 'button',
        role: 'tab',
        id: `cq-books-tab-${d.id}`,
        'aria-controls': `cq-books-panel-${d.id}`,
        'aria-selected': 'false',
        tabindex: -1,
      },
      on: {
        click: () => selectTab(i),
        keydown: (e) => {
          const last = defs.length - 1;
          let next = -1;
          if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
          else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = last;
          if (next < 0) return;
          e.preventDefault();
          selectTab(next, true);
        },
      },
    }),
  );
  const panels = defs.map((d) => {
    d.tab.el.classList.add('cq-books__panel');
    d.tab.el.setAttribute('role', 'tabpanel');
    d.tab.el.id = `cq-books-panel-${d.id}`;
    d.tab.el.setAttribute('aria-labelledby', `cq-books-tab-${d.id}`);
    // 元帳は内側のスクロール領域がフォーカスを受ける。それ以外はパネル自体をキーボードでスクロールできるように
    if (d.id !== 'ledger') d.tab.el.tabIndex = 0;
    d.tab.el.hidden = true;
    return d.tab.el;
  });

  const closeBtn = el(
    'button',
    { class: 'cq-books__close', attrs: { type: 'button', 'aria-label': '帳簿を閉じる（Esc）' }, on: { click: () => close() } },
    el('span', { text: '閉じる' }),
    el('kbd', { class: 'cq-kbd cq-kbd--sm', text: 'Esc' }),
  );

  const drawer = el(
    'aside',
    { class: 'cq-books__drawer', attrs: { role: 'region', 'aria-label': '帳簿' } },
    el(
      'header',
      { class: 'cq-books__head' },
      el('h2', { class: 'cq-books__title', text: '帳簿' }),
      el('p', { class: 'cq-books__lead', text: '仕訳から作られた、いまの数字' }),
      closeBtn,
    ),
    el('div', { class: 'cq-books__tabs', attrs: { role: 'tablist', 'aria-label': '帳簿の種類' } }, ...tabButtons),
    el('div', { class: 'cq-books__panels' }, ...panels),
  );
  drawer.inert = true;
  const root = el('div', { class: 'cq-books' }, drawer);

  const refresh = (): void => {
    defs[active]?.tab.update(store.getState());
  };

  function selectTab(i: number, focus = false): void {
    active = i;
    tabButtons.forEach((b, j) => {
      const on = j === i;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p, j) => {
      p.hidden = j !== i;
    });
    if (isOpen) refresh();
    if (focus) tabButtons[i]?.focus();
  }

  const canOpen = (): boolean => {
    const p = store.getState().phase;
    return p !== 'title' && p !== 'ended';
  };

  const notify = (): void => {
    document.dispatchEvent(new CustomEvent<BooksStateDetail>(EV_BOOKS_STATE, { detail: { open: isOpen } }));
  };

  function open(): void {
    if (isOpen || !canOpen()) return;
    isOpen = true;
    prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.classList.add('is-open');
    drawer.inert = false;
    refresh();
    tabButtons[active]?.focus({ preventScroll: true });
    notify();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    const a = document.activeElement;
    const restore = drawer.contains(a) || a === null || a === document.body;
    root.classList.remove('is-open');
    drawer.inert = true;
    // ドロワーの中にフォーカスがあったときだけ、開く前の場所へ戻す（カード側へ移っていたら奪わない）
    if (restore && prevFocus?.isConnected) prevFocus.focus({ preventScroll: true });
    prevFocus = null;
    notify();
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  const onToggleEvent = (): void => toggle();
  const onKey = (e: KeyboardEvent): void => {
    if (e.isComposing) return;
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      close();
      return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code !== 'KeyB' && e.key.toLowerCase() !== 'b') return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    toggle();
  };
  document.addEventListener(EV_TOGGLE_BOOKS, onToggleEvent);
  document.addEventListener('keydown', onKey);

  const unsubscribe = store.subscribe((state) => {
    if (state.phase === 'title' || state.phase === 'ended') {
      if (isOpen) close();
      return;
    }
    if (isOpen) refresh();
  });

  selectTab(0);

  return {
    el: root,
    open,
    close,
    toggle,
    destroy() {
      unsubscribe();
      document.removeEventListener(EV_TOGGLE_BOOKS, onToggleEvent);
      document.removeEventListener('keydown', onKey);
      if (isOpen) close();
      root.remove();
    },
  };
}
