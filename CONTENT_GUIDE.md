# カード作成ガイド

Closing Quest の「業務カード」を作るときの決まり。1 年（令和8年度：2026/4〜2027/3）を、四半期ごとのファイルに分けて書く。

- `src/core/scenario/cards/apr-jun.ts`（4〜6月）／`jul-sep.ts`／`oct-dec.ts`／`jan-mar.ts`
- 月次決算のカードと決算ステージ（翌4〜6月）は別ファイル（monthClose.ts / stage.ts）で作成済み。ここでは触らない。

## 会社と数字（正典）

`src/core/scenario/company.ts` と `baseline.ts` を必ず読む。

- ミナト商事株式会社（文具・オフィス用品の卸、従業員 8 名、3 月決算）。消費税は税抜経理 10%、商品売買は三分法。
- 毎月の売上・仕入・回収・支払・給与・社保・家賃・光熱費・通信費・利息・減価償却/保険料の月割は、`baseline.ts` が**自動で帳簿に入れる**（実務の自動仕訳）。カードで二重に計上しない。
- 数字は `company.ts` の定数（`PAYMENTS`, `MONTHLY`, `BONUS`, `COMPANY`, `consumptionTaxInterim()` など）から作る。金額を直書きしない。

## 帳簿に仕訳を入れるカード（必須・ID と日付と仕訳は固定）

次のカードだけが、帳簿に仕訳を入れる。ID・日付（月/日）・仕訳（借方/貸方と金額）を**変えない**。`JournalQuestion`（`expected[0]` が計上される）か、カードの `postings` のどちらかで入れる。`mandatory: true`。
金額は `company.ts` の定数を使う。開発時のコンソールに出る整合性チェック（`src/core/scenario/validate.ts`）が、これらの存在と仕訳を検査する。

| カード ID | 日付 | 仕訳（借方 ／ 貸方） | 内容 |
|---|---|---|---|
| c04_fixed_asset_tax_1 | 4/28 | 租税公課 ／ 普通預金（`PAYMENTS.fixedAssetTaxInstallment`） | 固定資産税（償却資産）第1期 |
| c05_vehicle_tax | 5/31 | 租税公課 ／ 普通預金（`PAYMENTS.vehicleTax`） | 自動車税（納税通知書の額） |
| c06_resident_tax_1 | 6/10 | 住民税預り金 ／ 普通預金（`residentTax × 6`） | 住民税の納期の特例（12〜5月分） |
| c07_withholding_1 | 7/10 | 所得税預り金 ／ 普通預金（`incomeTax × 6`） | 源泉所得税の納期の特例（1〜6月分） |
| c07_labor_insurance | 7/10 | 法定福利費 ／ 普通預金（`PAYMENTS.laborInsuranceEstimate`） | 労働保険の年度更新（概算保険料が 40 万円未満なので一括） |
| c07_bonus_summer | 7/10 | 賞与 ／ 所得税預り金・社会保険料預り金・普通預金（`BONUS`） | 夏季賞与の支給 |
| c07_fixed_asset_tax_2 | 7/28 | 租税公課 ／ 普通預金 | 固定資産税 第2期 |
| c08_insurance_annual | 8/1 | 前払費用 ／ 普通預金（`PAYMENTS.insuranceAnnual`） | 火災保険の年払い（払ったときは資産にする） |
| c11_interim_corporate_tax | 11/30 | 仮払法人税等 ／ 普通預金（`corporateTaxInterim()`） | 法人税等の中間納付（前期の年税額の 1/2） |
| c11_interim_consumption_tax | 11/30 | 未払消費税等 ／ 普通預金（`consumptionTaxInterim().total`） | 消費税の中間納付（国税＋地方消費税） |
| c12_resident_tax_2 | 12/10 | 住民税預り金 ／ 普通預金（`residentTax × 6`） | 住民税の納期の特例（6〜11月分） |
| c12_bonus_winter | 12/10 | 賞与 ／ 所得税預り金・社会保険料預り金・普通預金（`BONUS`） | 冬季賞与の支給 |
| c12_year_end_adjustment | 12/20 | 所得税預り金 ／ 普通預金（`PAYMENTS.yearEndRefund`） | 年末調整の過納額を従業員へ還付 |
| c12_fixed_asset_tax_3 | 12/25 | 租税公課 ／ 普通預金 | 固定資産税 第3期 |
| c01_withholding_2 | 1/20 | 所得税預り金 ／ 普通預金（`incomeTax × 6 + BONUS.incomeTax × 2 − yearEndRefund`） | 源泉所得税の納期の特例（7〜12月分） |
| c02_fixed_asset_tax_4 | 2/25 | 租税公課 ／ 普通預金 | 固定資産税 第4期 |

これ以外のカードは**帳簿に仕訳を入れない**（`postings` なし、`JournalQuestion` なし）。仕訳の設問を入れたい場合は、上の必須カードの中に、同じ仕訳を求める設問として置く（追加の仕訳を作らない）。期限違反のペナルティ（`penalty`）は使ってよい。

## カードの作り方

型は `src/core/tasks/types.ts`。`Card` を返すオブジェクト（または `(ctx) => Card` の動的カード。帳簿の数字を使うとき）。

- `id`：`c{月2桁}_{英小文字_スラッグ}`（例：`c04_invoice_check`）。全体で一意。
- `kind`：JOURNAL / DEADLINE / CALC / AUDIT / DECISION / REPORT / CHANCE。簿記だけにならないよう、種類を散らす。
- `date`：`mkDate(period, day)`。period は 4月=0 … 12月=8、1月=9、2月=10、3月=11。**月末日（月次決算の日）は使わない**（月次決算が月の最後のマスになるため。ただし必須カードの 5/31 は例外で、順序は保証済み）。
- `mandatory`：期限が法律で決まっているもの・必須カードは true。ほかは false（止まったときだけ起きる）。
- `squareLabel`：盤面のマスに出る短い名前（全角 6 文字程度まで。8 文字を超えない）。
- `skill`：bookkeeping / tax / labor / cash / audit。
- `situation`：状況説明。誰が何を頼んできたか（社長、税理士の先生、総務の担当者など。名前は架空でよい）を 1〜3 文で。
- `facts`：請求書・通帳・台帳・通知書などを表（`FactTable`）で見せる。数値列は `numericColumns`。
- `questions`：1〜4 問。型は choice（択一）/ multi（複数選択：誤り探し）/ number（数値入力）/ journal（仕訳）。
  - すべてに `explain`（なぜそうなるか。必須）。`hints` は 0〜3 個で、段階が進むほど答えに近づける。
  - journal は `accounts` に、正解の科目に加えて**引っかけの科目を 2〜4 個**入れる。`traps` で、よくある間違いに専用の説明をつける。
  - 選択肢の正解位置が毎回同じにならないよう、`answer` の位置を散らす。誤りの選択肢は「もっともらしいが、理由があって誤り」にする。
- `sources`：出典（`SourceRef`）。DEADLINE には必須。確認日 `asOf` は `2026-09-26`。
  - **国税庁で確認済み（`verified: 'primary'`）**：源泉所得税の納期の特例 https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm、消費税の中間申告 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm
  - それ以外は民間の解説による（`verified: 'secondary'`）：弥生 https://www.yayoi-kk.co.jp/kaikei/oyakudachi/keri-schedule/、請求ABC https://media.invoice.ne.jp/column/industry-tips/accounting-Schedule.html、マネーフォワード https://biz.moneyforward.com/accounting/basic/46320/
  - 必要なら WebFetch や Claude in Chrome で国税庁・厚生労働省・日本年金機構などの一次情報を確認してよい。**確認できたものだけ `primary`**にする。確認できないことは、断定せず、`secondary` にするか、設問にしない。**法令・期限・金額・要件を推測で作らない。**

## 事実として使ってよい内容（調査済み）

- 源泉所得税：原則は支払月の翌月10日。常時 10 人未満は納期の特例（承認が必要）で、1〜6 月分は 7/10、7〜12 月分は翌 1/20。期限が休日なら翌開庁日。【primary】
- 消費税の中間申告：直前の年税額（国税）が 48 万円超で必要。48〜400 万円は年 1 回で確定額の 6/12、400〜4,800 万円は年 3 回（3/12）、4,800 万円超は年 11 回（1/12）。期限は対象期間の末日の翌日から 2 か月以内（3 月決算の年 1 回は 11/30）。地方消費税は国税の 22/78 を併せて納付。【primary】
- 住民税（特別徴収）：原則は翌月 10 日。従業員 10 人未満の納期の特例で、6〜11 月分は 12/10、12〜5 月分は 6/10。【secondary】
- 社会保険の賞与支払届：賞与支給日から 5 日以内に日本年金機構へ。【secondary】
- 算定基礎届：7/1 時点の被保険者の 4〜6 月の報酬で作り、7/10 までに日本年金機構へ。決定した標準報酬月額は 9 月から翌年 8 月まで適用。【secondary】
- 労働保険の年度更新：6/1〜7/10 に申告・納付。前年度の確定保険料と当年度の概算保険料をまとめて申告。概算保険料が 40 万円以上なら 3 回に分けて納付できる。遅れると追徴金 10%。【secondary】
- 法定調書合計表・給与支払報告書（市区町村）・償却資産の申告：いずれも 1/31。【secondary】
- 固定資産税：年 4 期。多くの自治体で 4・7・12・翌 2 月（東京都は 6・9・12・翌 2 月）。納税通知書で確認。【secondary】
- 自動車税：4/1 時点の所有者に課税され、5 月末ごろ納付。【secondary】
- 法人税・消費税の確定申告と納付：事業年度終了の翌日から 2 か月以内（3 月決算は 5/31）。法人税の申告期限は特例申請で 1 か月延長できる場合がある（納付期限は延びない）。【secondary】
- 法人税の中間申告：前事業年度の法人税額が 20 万円を超える場合に必要。3 月決算は 11/30。【secondary】
- 年末調整：12 月の給与で、年間の給与と源泉徴収税額から正しい所得税額を出し、過不足を精算する。扶養控除等申告書・保険料控除申告書を回収して確認する。【secondary】
- 経理の遅延の主因は経理の外の前工程：請求書の受領 30.8%、経費の集計・チェック 30.6%、仕訳入力 21.8%、拠点・部門からの情報収集 21.8%（請求ABC の調査）。【secondary】
- インボイス（適格請求書）制度：仕入税額控除には、原則として適格請求書発行事業者の登録番号などが載った請求書が必要。【一般知識。細部は一次情報で確認してから使う】

## 品質の基準

- 日本語は自然で簡潔に。専門用語は初出で言い換えるか、explain で説明する。上から目線にしない。
- 教えたいこと（なぜその期限か、なぜその科目か、実務でどう役立つか）を explain に必ず書く。
- 数値の設問は、答えが 1 つに決まるように条件を明示する（端数の扱い、税込/税抜など）。
- 計算は必ず自分で検算する。数字が合わない設問は出さない。
- ゲームとして、1 枚のカードは 1〜3 分で終わる分量にする。

## 確認方法

```bash
cd closing-quest   # リポジトリのルートで実行する
npx tsc --noEmit                 # 型（strict / noUncheckedIndexedAccess / noUnusedLocals）
```

`src/core/scenario/validate.ts` は編集しない。
