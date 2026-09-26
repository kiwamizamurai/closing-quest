import { accountName, diffLines, linesEqual, normalizeLines, sumSide, type JournalLine, type LineDiff } from '../accounting';
import type { Answer, Judgement, JournalQuestion, Question } from './types';

const SIDE_JA = { debit: '借方', credit: '貸方' } as const;

const ok = (credit: 1 | 0.5 = 1): Judgement => ({
  verdict: credit === 1 ? 'correct' : 'partial',
  credit,
  messages: credit === 1 ? [] : ['正解に近い選択です。ただし、より適切な答えがあります。'],
});

const ng = (...messages: string[]): Judgement => ({ verdict: 'wrong', credit: 0, messages });

/** 誤答の内訳を、答えを丸ごと明かさない短い日本語にする。 */
const describeDiff = (d: LineDiff): string => {
  switch (d.type) {
    case 'wrong_side':
      return `「${accountName(d.account)}」は${SIDE_JA[d.expectedSide]}に置く科目です。`;
    case 'wrong_amount':
      return `「${accountName(d.account)}」（${SIDE_JA[d.side]}）の金額が違います。`;
    case 'missing':
      return `${SIDE_JA[d.line.side]}の記入が足りません（科目または金額）。`;
    case 'extra':
      return `「${accountName(d.line.account)}」（${SIDE_JA[d.line.side]}）の行は、科目か金額が違うか、不要です。`;
  }
};

const judgeJournal = (q: JournalQuestion, lines: readonly JournalLine[]): Judgement => {
  const filled = normalizeLines(lines);
  if (filled.length === 0) return ng('仕訳が入力されていません。');

  if (q.expected.some((e) => linesEqual(e, filled))) return ok();

  const messages: string[] = [];
  if (sumSide(filled, 'debit') !== sumSide(filled, 'credit')) {
    messages.push('借方の合計と貸方の合計が一致していません。');
  }
  for (const t of q.traps ?? []) {
    if (filled.some((l) => l.account === t.account && l.side === t.side)) messages.push(t.message);
  }
  // 最も近い正解との差を示す
  let best: LineDiff[] | undefined;
  for (const e of q.expected) {
    const diffs = diffLines(e, filled);
    if (!best || diffs.length < best.length) best = diffs;
  }
  for (const d of best ?? []) messages.push(describeDiff(d));
  return ng(...messages);
};

/** 回答を採点する。型が設問と合わない回答は不正解。 */
export const judge = (q: Question, a: Answer): Judgement => {
  switch (q.type) {
    case 'choice': {
      if (a.type !== 'choice') return ng('選択肢を選んでください。');
      if (a.index === q.answer) return ok();
      if (q.partial?.includes(a.index)) return ok(0.5);
      return ng('選んだ答えが違います。');
    }
    case 'multi': {
      if (a.type !== 'multi') return ng('選択肢を選んでください。');
      const chosen = new Set(a.indices);
      const answer = new Set(q.answer);
      const missing = q.answer.filter((i) => !chosen.has(i));
      const extra = a.indices.filter((i) => !answer.has(i));
      if (missing.length === 0 && extra.length === 0) return ok();
      const messages: string[] = [];
      if (missing.length > 0) messages.push('見落としている項目があります。');
      if (extra.length > 0) messages.push('問題のない項目まで選んでいます。');
      return ng(...messages);
    }
    case 'number': {
      if (a.type !== 'number' || !Number.isFinite(a.value)) return ng('数値を入力してください。');
      if (Math.abs(a.value - q.answer) <= (q.tolerance ?? 0)) return ok();
      return ng('計算結果が違います。');
    }
    case 'journal': {
      if (a.type !== 'journal') return ng('仕訳を入力してください。');
      return judgeJournal(q, a.lines);
    }
  }
};

/** 設問の正解の回答を作る（自動プレイ・整合性チェック用）。 */
export const correctAnswer = (q: Question): Answer => {
  switch (q.type) {
    case 'choice':
      return { type: 'choice', index: q.answer };
    case 'multi':
      return { type: 'multi', indices: q.answer };
    case 'number':
      return { type: 'number', value: q.answer };
    case 'journal':
      return { type: 'journal', lines: q.expected[0] ?? [] };
  }
};

/** 必ず不正解になる回答を作る（自動プレイで誤答を再現する用）。 */
export const wrongAnswer = (q: Question): Answer => {
  switch (q.type) {
    case 'choice':
      return { type: 'choice', index: -1 };
    case 'multi':
      return { type: 'multi', indices: q.answer.length === 0 ? [0] : [] };
    case 'number':
      return { type: 'number', value: Number.NaN };
    case 'journal':
      return { type: 'journal', lines: [] };
  }
};

/** 設問で使えるヒントの数。 */
export const hintCount = (q: Question): number => Math.min(3, q.hints?.length ?? 0);

/** 設問の標準の正解（帳簿に計上する仕訳など）を返す。仕訳以外は undefined。 */
export const canonicalJournal = (q: Question): readonly JournalLine[] | undefined =>
  q.type === 'journal' ? q.expected[0] : undefined;
