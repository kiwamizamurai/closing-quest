import { createBook } from '../accounting';
import { buildBoard, resolveCard } from '../game/board';
import type { Scenario } from '../game/types';
import type { CardDef } from '../tasks/types';
import { buildAutoEntries } from './baseline';
import { cards as aprJun } from './cards/apr-jun';
import { cards as janMar } from './cards/jan-mar';
import { cards as julSep } from './cards/jul-sep';
import { cards as octDec } from './cards/oct-dec';
import { COMPANY, MONTH_END_INVENTORY, MONTHLY_SALES_BUDGET, OPENING_BALANCES } from './company';
import { allMonthCloseCards } from './monthClose';
import { stageCards } from './stage';

export { COMPANY } from './company';

/** 1 年分のシナリオを組み立てる。カードは日付順に盤面のマスになる。 */
export const createScenario = (): Scenario => {
  const defs: CardDef[] = [...aprJun, ...julSep, ...octDec, ...janMar, ...allMonthCloseCards(), ...stageCards()];
  const previewBook = createBook(OPENING_BALANCES);
  const board = buildBoard(defs, previewBook);

  const cardDefById: Record<string, CardDef> = {};
  for (const def of defs) {
    const id = resolveCard(def, { book: previewBook, date: 0 }).id;
    if (cardDefById[id]) throw new Error(`duplicate card id: ${id}`);
    cardDefById[id] = def;
  }

  return {
    id: 'minato-2026',
    companyName: COMPANY.name,
    fiscalYearLabel: '令和8年度（2026年4月〜2027年3月）',
    opening: OPENING_BALANCES,
    autoEntries: buildAutoEntries(),
    cardDefs: defs,
    cardDefById,
    board,
    monthEndInventory: MONTH_END_INVENTORY,
    monthlySalesBudget: Object.fromEntries(MONTHLY_SALES_BUDGET.map((v, i) => [i, v])),
    intro: {
      title: `${COMPANY.name} 経理担当、着任`,
      paragraphs: [
        `あなたは4月1日付けで、${COMPANY.name}（従業員${COMPANY.employees}名の文具・オフィス用品の卸売会社）に着任した経理担当です。前期の決算と申告は、前任者と税理士の先生が済ませてくれました。`,
        '社長からの依頼は、「毎月の数字を早く正確に見せてほしい」ということ。仕訳を切るだけでなく、請求書のチェック、納税や届出の期限の管理、給与・賞与・年末調整、資金繰りまで、経理の仕事は1年を通してさまざまです。',
        'ルーレットを回して1年を進みましょう。期限のマスと月末のマスでは必ず止まります。月末には月次決算をして、社長に報告します。年度末には決算をまとめ、申告と納付を済ませれば、ゴールです。',
      ],
    },
  };
};
