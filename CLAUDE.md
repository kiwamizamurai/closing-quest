# CLAUDE.md

Closing Quest：1年間（令和8年度）の経理業務を体験して学ぶ、人生ゲーム風の 3D すごろく。月次決算が毎月のサブゴール、年次決算と申告がゴール。

## コマンド

```bash
npm run dev          # 開発サーバー http://localhost:3100
npm run build        # 型検査 + 本番ビルド
npm run typecheck    # tsc（アプリ用と core 用の 2 つ）
```

テストは書かない方針（ユーザーの指示）。代わりに型検査と、実際にブラウザで遊んで確認する。

```bash
python3 scripts/build-art-atlas.py   # art-src/ の元画像から、月・種別のアイコンのアトラスを作る（Pillow）
```

- 開発中は、URL に `?debug` を付けるとコンソールから `window.__CQ__` が使える（`step()` で 1 手進める、`run(s => 条件)` で自動プレイ、`handle.fast = true` で演出を飛ばす）。
- 画面の確認は、ブラウザのタブが前面にないと描画ループが止まる（`document.hidden`）。自動確認にはヘッドレス Chrome（Playwright）を使う。
- 3D の見た目は `src/render/`。イラスト素材は `public/assets/art/`（無ければ手続き生成のまま動く）。

## 構成と依存の向き

```
src/core/      純 TypeScript。DOM / three / window / Math.random / Date.now を使わない
  accounting/  勘定・仕訳・帳簿・試算表・PL/BS・不変条件
  tasks/       業務カードの型、回答の採点
  game/        状態遷移（reducer）、盤面、ルーレット、乱数、スコア、セレクタ、ストア
  scenario/    会社の設定、定常取引、カード（月ごと）、月次決算、決算ステージ
src/render/    Three.js（core を読むだけ）
src/ui/        DOM（core を読むだけ。three を import しない）
src/app/       結線（store・render・ui）、セーブ
```

- `core` は `tsconfig.core.json`（`types: []`、DOM なし）でも型検査が通ること。
- `render` と `ui` は互いを import しない。`app` だけが両方を知る。
- 状態は `GameState`（JSON にできる）。アクションは `Action`。演出は reducer の外（イベントで通知し、`ANIM_DONE` で戻る）。

## 会計データの決まり

- 金額は整数円。税抜経理（税率 10%）、商品売買は三分法。
- 帳簿には正しい仕訳だけが入る。誤答は採点ログに残るだけで、3 回誤ると正解が自動計上される。
- 会社の数字は `src/core/scenario/company.ts` に集約。定常取引は `baseline.ts` が自動で入れる。カードは `CONTENT_GUIDE.md` の決まりに従う。
- 期限・金額・要件は出典（`sources`）と確認日を付ける。国税庁など一次情報で確認できたものだけ `verified: 'primary'`。**法令を推測で書かない**。

## アセットとライセンス

- 外部素材は CC0 のもの（Poly Haven / ambientCG / Kenney / Quaternius）だけ。
- 「人生ゲーム」は商標の可能性が高いので、名称・盤面・駒（ペグ付きの車など）の意匠を使わない。
