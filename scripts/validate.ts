/**
 * シナリオの整合性チェック。カードや定常取引を編集したあとに実行する。
 *   npx tsx scripts/validate.ts
 * 全問正解の自動プレイで 1 年を通し、貸借一致・必須カードの仕訳・期末残高の連続性などを確かめる。
 */
import { createScenario } from '../src/core/scenario';
import { validateScenario } from '../src/core/scenario/validate';

const report = validateScenario(createScenario());
console.log('--- stats ---');
for (const [k, v] of Object.entries(report.stats)) console.log(`${k}: ${v}`);
if (report.warnings.length > 0) {
  console.log(`--- warnings (${report.warnings.length}) ---`);
  for (const w of report.warnings) console.log(`! ${w}`);
}
if (report.errors.length > 0) {
  console.log(`--- errors (${report.errors.length}) ---`);
  for (const e of report.errors) console.log(`x ${e}`);
  process.exit(1);
}
console.log('OK: 整合性チェックに合格');
