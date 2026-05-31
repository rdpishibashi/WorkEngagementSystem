# WorkEngagementSystem 作業前チェック

このコマンドは、WorkEngagementSystem の各プロジェクトに変更を加える前に必要な事前確認を行う。
引数 $ARGUMENTS にプロジェクト名（admin / playbook / report / dashboard）が渡された場合はそのプロジェクトを優先する。引数がない場合はすべてのチェックを実施する。

## Step 0: we-system スキルの読み込み

**必ず最初に** `we-system` スキルを読み込む。GAS 制約・クロスプロジェクト整合性ルール・設計上の落とし穴チェックリストが含まれている。

## Step 1: 技術ドキュメントの確認

対象プロジェクトの docs フォルダにある技術文書を読む。

**Admin プロジェクトに変更を加える場合（必須）：**
- `Admin/docs/TECHNICAL_SPEC.md` — システム構成、カラム定義、データフロー、介入必要度の算出ロジック
- `Admin/docs/MODULE_REFERENCE.md` — 各モジュール・関数の仕様

**Report プロジェクトに変更を加える場合：**
- `Report/docs/TECHNICAL_SPEC.md`
- `Report/docs/MODULE_REFERENCE.md`
- `Report/docs/evaluate_reference.md`

**Notification プロジェクトに変更を加える場合：**
- `Notification/docs/TECHNICAL_SPEC.md` — 月次通知スケジュール、スプレッドシート構成、テストモード、保守注意点

**Playbook プロジェクトに変更を加える場合：**
- `Playbook/docs/we_analyzer_technical_documentation.md` — we_analyzer.py の技術仕様

**WE-Dashboard プロジェクトに変更を加える場合：**
- `WE-Dashboard/docs/` 内の技術ドキュメント（TECHNICAL_ARCHITECTURE.md, MODULE_REFERENCE.md, DATA_PIPELINE.md）

## Step 2: SpreadSheet ファイルの確認（Admin プロジェクトの場合は必須）

Admin プロジェクトに変更を加える場合、`SpreadSheet/` フォルダの Excel ファイルを読んで、
Google Spreadsheet の実際のフォーマット・カラム構成・データ内容を確認する。

確認対象ファイルと確認ポイント：

| ファイル | 確認ポイント |
|---|---|
| `SpreadSheet/RatingSS.xlsx` | Admin が読み取るソースデータ。実際のカラム数・カラム名・データの値の形式を確認。RatingSS には Report が算出したフィールドが格納されている。`rating` シートのカラム 0〜29 が対象（flag_constant_6m は存在しない）。 |
| `SpreadSheet/EngagementMasterSS.xlsx` | Admin が書き出す先。`rating2` シートの現在のカラム構成（46列）・ヘッダー名・実際のデータを確認。 |
| `SpreadSheet/MemberSS.xlsx` | メンバーマスタ。カラム構成と在籍メンバーを確認。 |

**注意点：**
- RatingSS のカラム名は Globals.gs の `ColumnRating*` 定数と対応している。ファイルを見て実際のカラム数を数え、コードの定数と一致しているか確認する。
- EngagementMasterSS の `rating2` シートに新規カラムを追加する場合、`RATING2_HEADERS` 配列・`ensureRating2Headers()` の両方に反映が必要。
- RatingSS に存在しないカラムを `getRatingsData()` で読もうとするとすべて空値になるため、新フィールドは Admin 内で算出するか別の方法で取得する必要がある。

## Step 3: 確認結果のサマリー

読み取った情報をもとに、以下を簡潔にまとめてから作業を開始する：

1. 関連するカラムインデックスとカラム名（コードとスプレッドシートの対応）
2. 変更対象の関数・モジュールと、それに依存する箇所
3. 作業に影響しそうな制約・注意点（カラム数の上限、命名規則など）

---

上記の確認が完了したら、ユーザーに確認結果のサマリーを提示し、作業方針を合意してから実装を開始する。
