import type { Card, ChoiceQuestion, FactTable, MultiQuestion, SourceRef } from '../../tasks/types';

export const src = (label: string, url: string, verified: SourceRef['verified']): SourceRef => ({
  label,
  url,
  asOf: '2026-09-26',
  verified,
});

export const SRC_FASS = src(
  '経済産業省 経理・財務サービス・スキルスタンダード（日本CFO協会）',
  'https://www.cfo.jp/fass/fass_exam/meti/skill_standard/',
  'primary',
);

export const SRC_YAYOI = src(
  '弥生 経理業務がわかる年間スケジュール（毎月の業務・月別の業務）',
  'https://www.yayoi-kk.co.jp/kaikei/oyakudachi/keri-schedule/',
  'secondary',
);

export const pick = (
  prompt: string,
  table: FactTable,
  answer: readonly number[],
  hint: string,
  explain: string,
  labels?: readonly string[],
): MultiQuestion => ({
  id: 'q1',
  type: 'multi',
  prompt,
  options: labels ?? table.rows.map((r) => String(r[0])),
  answer,
  table,
  hints: [hint],
  explain,
});

export const choose = (
  prompt: string,
  options: readonly string[],
  answer: number,
  hint: string,
  explain: string,
): ChoiceQuestion => ({ id: 'q1', type: 'choice', prompt, options, answer, hints: [hint], explain });

export const routine = (c: Omit<Card, 'mandatory' | 'squareType'>): Card => ({
  ...c,
  mandatory: false,
  squareType: 'routine',
});
