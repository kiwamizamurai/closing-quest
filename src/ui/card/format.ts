/** カードパネル用の数値まわりの補助（入力の正規化・桁区切り・単位）。 */
import type { NumberQuestion } from '@/core/tasks/types';
import { formatYen } from '@/core/types';

export type NumberUnit = NumberQuestion['unit'];

export const UNIT_LABEL: Record<NumberUnit, string> = {
  yen: '円',
  percent: '%',
  days: '日',
  people: '人',
  plain: '',
};

export type Parsed =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ok'; readonly value: number };

export interface ParseOptions {
  /** 小数点を許す（金額の仕訳では許さない）。 */
  readonly decimal: boolean;
  /** 負の数を許す。 */
  readonly negative: boolean;
}

/**
 * 入力文字列を数値にする。全角数字・全角カンマは NFKC で半角にそろえ、
 * 桁区切り・空白・単位の文字は無視する。△ ▲ − - は負の数として読む。
 */
export const parseInput = (raw: string, opts: ParseOptions): Parsed => {
  let s = raw.normalize('NFKC').trim();
  if (s === '') return { kind: 'empty' };
  s = s.replace(/[,\s円%日人]/g, '');
  if (s === '') return { kind: 'invalid' };
  let neg = false;
  if (/^[-−ー△▲]/.test(s)) {
    neg = true;
    s = s.slice(1);
  }
  if (neg && !opts.negative) return { kind: 'invalid' };
  const re = opts.decimal ? /^\d+(\.\d+)?$/ : /^\d+$/;
  if (!re.test(s)) return { kind: 'invalid' };
  const v = Number(s);
  if (!Number.isFinite(v)) return { kind: 'invalid' };
  if (!opts.decimal && !Number.isSafeInteger(v)) return { kind: 'invalid' };
  return { kind: 'ok', value: neg && v !== 0 ? -v : v };
};

/** 3 桁区切り。例: 1234567 -> "1,234,567" */
export const groupDigits = (n: number): string => n.toLocaleString('ja-JP', { maximumFractionDigits: 6 });

/** 単位つきの数値表示。円は △ 表記、それ以外は単位を後ろに付ける。 */
export const formatWithUnit = (n: number, unit: NumberUnit): string =>
  unit === 'yen' ? formatYen(n) : `${groupDigits(n)}${UNIT_LABEL[unit]}`;

/** 0〜1 の得点率を「87%」にする。 */
export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

/** 符号つきの数（信頼の増減など）。 */
export const signed = (n: number): string => (n > 0 ? `+${groupDigits(n)}` : n < 0 ? `−${groupDigits(-n)}` : '0');

/** macOS 系か（ショートカットの表記を ⌘ にするため）。 */
export const isMacLike = (): boolean => /Mac|iPhone|iPad/i.test(navigator.userAgent);
