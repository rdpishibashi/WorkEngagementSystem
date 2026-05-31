# Admin - モジュールリファレンス

## ファイル一覧

| ファイル | 行数 | 目的 |
|---|---|---|
| `Globals.gs` | 157 | グローバル変数、スプレッドシート参照、カラム定数 |
| `master_updater.gs` | 49 | メインオーケストレーター — `updateMaster()` |
| `engagement_management.gs` | ~400 | レーティングデータ処理、flag_constant_6m算出、介入必要度算出、マスタシート書き込み |
| `comment_management.gs` | 106 | コメントデータ抽出、属性更新、マスタ書き込み |
| `member_management.gs` | 121 | メンバーリスト、組織属性更新（EngagementMasterAll含む） |
| `maintenance.gs` | 427 | メンテナンスユーティリティ — ヘッダー更新、データ削除、EngagementMasterAll同期、person_master生成 |
| `validate_rating_sync.gs` | 245 | Rating/個人シートの同期検証と自動修正 |
| `initial_setup.gs` | 34 | 初期設定 — ConfigurationSSからスプレッドシートIDを出力 |
| `utilities.gs` | 18 | ヘルパー関数 — 日付解析、回答日調整 |

---

## Globals.gs

スクリプト起動時に読み込まれるグローバル設定。すべての変数は`const`で即座に初期化される。

### スプレッドシート参照

```
ConfigurationSS → セルC3–C12を読み取り → 10のスプレッドシートをオープン
```

各スプレッドシート変数（`AnswerSS`、`RatingSS`など）は、ConfigurationSSに格納されたIDを使って`SpreadsheetApp.openById()`で開かれる。

### シート参照

| 変数名 | スプレッドシート | シート名 |
|---|---|---|
| `AnswerSheet` | AnswerSS | "Form Responses 1" |
| `RatingSheet` | RatingSS | "rating" |
| `CommentSheet` | CommentSS | "comments" |
| `MemberSheet` | MemberSS | "members" |
| `NoEntrySheet` | NoEntrySS | "member not entered" |
| `RatingMasterSheet` | EngagementMasterSS | "rating" |
| `RatingMasterSheet2` | EngagementMasterSS | "rating2" |
| `EvaluationMasterSheet` | EngagementMasterSS | "evaluation" |
| `CommentMasterSheet` | EngagementMasterSS | "comment" |
| `RatingMasterAllSheet2` | EngagementMasterAllSS | "rating2" |
| `CommentMasterAllSheet` | EngagementMasterAllSS | "comment" |
| `GreetingSheet` | MessageSS | "greeting" |
| `MessageSheet` | MessageSS | "positive psychology" |

### カラムインデックスグループ

- **共通カラム（0–16）**：全マスタシート共通 — year, month, day, date, mail_address, name, division/current_division, department/current_department, section/current_section, team/current_team, project/current_project, grade
- **マスタRatingカラム（17–18）**：factor, score
- **Master2/rating2カラム（17–45）**：エンゲージメント/活力/熱意/没頭のレーティング、分析フィールド、介入必要度、統計指標、flag_constant_6m
- **Ratingシートカラム（5–30）**：Reportのratingシートレイアウト（master2とは異なる）
- **Commentカラム（17–18）**：concern, comment
- **Memberカラム（1–11）**：name, kana, alternativeName, address, 組織階層, leave

---

## master_updater.gs

### `updateMaster()`

メインエントリーポイント。ReportのRatingSS から1か月分のデータをEngagementMasterSSに転送する。

```javascript
function updateMaster()
```

**処理フロー：**
1. 対象年月を決定（現在月の前月）
2. `getMemberList()` — メンバーマスタを読み込む
3. `getRatingsData(year, month)` — RatingSS から分析結果を読み込む
3b. `computeFlagConstant6mMap(year, month)` — RatingSS の全履歴から flag_constant_6m を算出
4. 各レーティングをメンバーと紐づけ：`rating.flag_constant_6m`を注入後`createMasterDataToBeAdded()` — 3つのマスタシート用レコードを生成
5. `addToMasterRatingSheets()` — rating, rating2, evaluationデータを書き込む
6. `getCommentData()` + `updateCommentAttribute()` + `addToMasterCommentSheet()` — コメントを処理
7. `updateOrganizationData()` — 全マスタシート（EngagementMasterSS 4シート＋EngagementMasterAll 2シート）の現在の組織属性を更新
8. `updatePersonMasterSheet()` — EngagementMasterSSのperson_masterシートを更新

**月の計算**：前月を使用する（例：3月に実行すると2月のデータを処理）。特殊ケース：1月 → 前年の12月。

---

## engagement_management.gs

### `computeFlagConstant6mMap(year, month)`

RatingSS の全履歴を読み取り、各アドレスの対象月の `flag_constant_6m` 値を算出する。

```javascript
function computeFlagConstant6mMap(year, month) → Object
```

**背景**：RatingSS には `flag_constant_6m` カラムが存在しない。このフラグはAdminが vigor/dedication/absorption の時系列から独自に算出する。

**2パスアルゴリズム：**

1. **Pass 1 — 予備フラグ**：対象月までの全履歴で3ヶ月ウィンドウを走査し、v==d==a（全て同値、非空）が3ヶ月連続する場合に level に基づいてフラグを付与：
   - Critical/Low → `LOW_FIXED`（+3点）
   - Moderate → `MID_EVASION`（+2点）
   - High/Thriving → `HIGH_AVOIDANCE`（+2点）

2. **Pass 2 — FIX_SHIFTED 判定**：予備フラグが LOW_FIXED/MID_EVASION/HIGH_AVOIDANCE の場合のみ実行。現在の固定値ランの3ヶ月目（`fixedVals[i-3] != currentFixed`）で、かつ過去に別の固定値で既存フラグ状態があった場合 → `FIX_SHIFTED`（+4点、最優先）

**戻り値**：`{ "mail_address": "LOW_FIXED" | "MID_EVASION" | "HIGH_AVOIDANCE" | "FIX_SHIFTED" | "" }` の形式のオブジェクト。

### `getRatingsData(year, month)`

ReportのRatingシートから特定月の分析結果を読み取る。

```javascript
function getRatingsData(year, month) → Array<Object>
```

**戻り値**：31のプロパティを持つレーティングオブジェクトの配列。RatingSS のカラムインデックスを名前付きフィールド（year, month, day, date, address, engagement, vigor, dedication, absorption, level, trend_base, trend_recent, trend_refined, big_change, stability_6, strength/weakness short/mid, 統計指標）にマッピングする。

### `createMasterDataToBeAdded(masterData, rating, member)`

1つのrating+memberペアを3つの専用作成関数にルーティングする。

```javascript
function createMasterDataToBeAdded(masterData, rating, member)
```

呼び出し先：
- `createRatingMasterToBeAdded()` → `masterData.ratings`に追加
- `createRating2MasterToBeAdded()` → `masterData.ratings2`に追加
- `createEvaluationMasterToBeAdded()` → `masterData.evaluations`に追加

### `createRatingMasterToBeAdded(ratingsToBeAppended, rating, member)`

1人あたり**4行**を生成（因子ごとに1行：エンゲージメント/活力/熱意/没頭）。

各行は19列（共通17列 + 因子名 + 正規化スコア）。

**スコアの正規化**：`factor.value / factor.max * MaxScale`
- エンゲージメント：生値 / 54 × 10
- コンポーネント：生値 / 18 × 10

### `createRating2MasterToBeAdded(ratings2ToBeAppended, rating, member)`

1人あたり**1行**（rating2シート用の全46列）を生成する。

主な処理：
1. `calculateInterventionPriority(rating)` を呼び出し → `{neg, pos}`を取得
2. 共通カラム、生スコア、分析フィールド、介入必要度、統計指標を組み合わせた44要素の配列を構築
3. 文字列フィールドには`||`（デフォルト`""`）、数値フィールドには`??`（`0`を保持）を使用

### `calculateInterventionPriority(rating)`

Adminのコア分析関数。双方向の介入必要度スコアを算出する。

```javascript
function calculateInterventionPriority(rating) → {neg: number, pos: number}
```

スコアリングテーブルの詳細はTECHNICAL_SPEC.md「介入必要度の算出」セクションを参照。

**関数内ローカル定数**：

| 定数 | 値 | 用途 |
|------|-----|------|
| `TREND_SLOPE_3M` | `5.0` | 直近3ヶ月トレンド判定の E_slope_3m 閾値（単位: 生スコアの点数/月）。we_analyzer.py / evaluate.gs の `TREND_SLOPE_3M` と同値 |
| `DELTATIERS` | `[[1.0,2.0,1],[2.0,3.0,2],[3.0,4.0,3],[4.0,Inf,4]]` | E_delta_1_std_12 の σ 倍数によるティアスコア（1σ 以内は 0 点） |
| `SLOPETIERS` | `[[0.25,0.50,1],[0.50,1.00,2],[1.00,1.50,3],[1.50,Inf,4]]` | E_slope_6_std_12 の σ/月 によるティアスコア（0.25σ/月 以内は 0 点） |
| `flagConstantPoints` | `{LOW_FIXED:3, MID_EVASION:2, HIGH_AVOIDANCE:2, FIX_SHIFTED:4}` | flag_constant_6m の neg 加点マップ |

**ヘルパー**：`getTieredScore(absValue, tiers)` — 最初にマッチする `[下限, 上限, スコア]` のティアのスコアを返す。境界条件は **下限 exclusive・上限 inclusive** (`lower < absValue <= upper`)。すべてのティアにマッチしない場合は 0 を返す。

ティアスコアの各閾値の詳細な意味と換算例は TECHNICAL_SPEC.md「ティアスコアの計算詳細」セクションを参照。

### `createEvaluationMasterToBeAdded(evaluationToBeAppended, rating, member)`

1人あたり**1行**をevaluationシート用に生成（19列）。

名前フィールドには`name`ではなく`alternativeName`を使用し、評価ラベルには`getEngagementCategory()`を使用する。

### `getEngagementCategory(engagement)`

```javascript
function getEngagementCategory(engagement) → "高い" | "中間" | "低い"
```

- ≥ 32.4 → "高い"
- ≤ 10.8 → "低い"
- その他 → "中間"

### `RATING2_HEADERS`

rating2シートの46列のヘッダーを定義する定数配列。`ensureRating2Headers()`でヘッダーの整合性を保証するために使用される。

### `ensureRating2Headers()`

`RATING2_HEADERS`をrating2マスタシートの1行目に書き込む。必要に応じてカラムを追加挿入する。

### `addToMasterRatingSheets(masterData)`

3つのratingマスタシートすべてにデータを書き込む。rating2への書き込み前に`ensureRating2Headers()`を呼ぶ。

### `addDataToSheet(sheet, data)`

汎用の追記関数。2次元配列を次の空き行に書き込む。

---

## comment_management.gs

### `getCommentData(year, month)`

CommentSheetから特定月のコメントを読み取る。

```javascript
function getCommentData(year, month) → Array<Object>
```

**戻り値**：全共通カラム + concern + comment を持つコメントオブジェクトの配列。

### `updateCommentAttribute(year, month)`

既存のコメント行のメンバー属性（名前、組織）を更新する。

```javascript
function updateCommentAttribute(year, month)
```

対象月にマッチする各コメント行に対して：
1. メールアドレスでメンバーを検索
2. name, division, department, section, team, project, gradeを上書き
3. `division`と`current_division`の両方に同じ値（現在の値）を書き込む

### `addToMasterCommentSheet(data)`

コメントオブジェクトを2次元配列（19列）としてCommentMasterSheetに追記する。

---

## member_management.gs

### `getMemberList()`

メンバーマスタシートを読み取る。

```javascript
function getMemberList() → Array<Object>
```

**戻り値**：以下のプロパティを持つメンバーオブジェクトの配列：id, name, kana, alternativeName, address, division, department, section, team, project, grade, leave。

### `updateOrganizationData(memberList)`

4つのマスタシートすべてで`current_*`列とgradeを更新する。

```javascript
function updateOrganizationData(memberList)
```

共有カラムマップを使い、各シートに対して`updateAttributes()`を呼び出す：
- RatingMasterSheet
- RatingMasterSheet2
- EvaluationMasterSheet
- CommentMasterSheet
- RatingMasterAllSheet2（EngagementMasterAll）
- CommentMasterAllSheet（EngagementMasterAll）

### `updateAttributes(sheet, memberList, columnMap)`

属性更新のコアロジック（差分ベース）。

```javascript
function updateAttributes(sheet, memberList, columnMap)
```

**行ごとのロジック：**
- **メンバーが見つかり、退職・転属**（`leave === "leave"`）：全組織フィールドをクリア
- **メンバーが見つかり、在籍中または長期休職**（`leave === ""` or `"absence"`）：各フィールドを比較し、1つでも差異があれば更新キューに追加
- **メンバーが見つからない**：全組織フィールドをクリア（退職と見なす）

変更のあった行のみ書き込む。書き込みは行単位（シート全体の一括書き込みではない）。

---

## maintenance.gs

ファイル構成：エントリーポイント（GAS Run ドロップダウンに表示）が前半、ヘルパー関数（`_`プレフィックスで非表示）が後半。

### エントリーポイント

### `updateRating2Headers()`

`ensureRating2Headers()`を呼び出し、カラム数をログ出力するラッパー。いつでも安全に実行可能 — ヘッダー行（1行目）のみ更新する。

### `deleteSpecifiedWavesData()`

年月がハードコードされた便利関数。`_deleteMonthData()`を呼び出す。

### `validateCurrentMonth(autoFix)`

直近月のRating同期を検証する。前月を自動的に算出する。

```javascript
function validateCurrentMonth(autoFix = false) → Object
```

### `validateMonth()`

年月とautoFixがハードコードされたアドホック検証用の便利関数。

### `validateRecent()`

`scanRecentMonths(false)`を呼び出す便利関数 — 過去6か月のスキャンのみモード。

### `makeIndividualSheet()`

アドレスと日付がハードコードされた、特定個人の個人シート再構築用便利関数。

### `remakeAllEvaluations()`

指定した開始日から全個人シートを再構築する。

```javascript
function remakeAllEvaluations()
```

**処理フロー：**
1. 全メンバーをイテレーション
2. 各メンバーについて、開始日以降のレーティング行を検索
3. 最新のマッチング行に対して`_rebuildIndividualSheetInternal()`を呼び出す
4. 各メンバーのエンゲージメントスコアをログ出力

### `syncToEngagementMasterAll()`

EngagementMasterSSからEngagementMasterAllにデータを同期する。

```javascript
function syncToEngagementMasterAll()
```

**処理フロー：**
1. rating2シートとcommentシートをそれぞれ`_syncSheetToAll()`で同期（既存の年月はスキップ）
2. `updateAttributes()`で同期先の`current_*`列を最新の組織情報に更新

### `updatePersonMasterSheet()` / `updatePersonMasterAllSheet()`

EngagementMasterSS / EngagementMasterAll にperson_masterシートを生成・更新する。

```javascript
function updatePersonMasterSheet()   // EngagementMasterSS
function updatePersonMasterAllSheet() // EngagementMasterAll
```

内部で`_writePersonMasterSheet()`を呼び出す。person_masterシートの列は`PERSON_MASTER_HEADERS`定数で定義：
`mail_address, name, division, department, section, team, project, grade, status, is_active, last_measured_date`

### ヘルパー関数（`_`プレフィックス）

以下の関数は`_`プレフィックスによりGAS Runドロップダウンから非表示となる。

### `_deleteMonthData(year, month)`

指定した年月のレコードを4つのマスタシートすべてから削除する。

**戦略**：フィルター＆再書き込み（シートをクリア → ヘッダー書き込み → フィルタ済みデータ書き込み）。行単位の削除よりはるかに高速。

### `_deleteMonthFromSheet(sheet, year, month, sheetName)`

単一シートの削除処理の実装。削除されたレコード数をログ出力する。

### `_rebuildIndividualSheetInternal(address, startDate, period, ratingRowNumber)`

RatingSS 内の個人シートを再構築するコア関数。

```javascript
function _rebuildIndividualSheetInternal(address, startDate, period, ratingRowNumber = null) → Object
```

**処理フロー：**
1. 全レーティングデータを読み取る
2. アドレスと日付範囲でフィルタリング
3. 個人シートを作成またはクリア（メンバー名で命名）
4. ヘッダー + フィルタ済み行を書き込む
5. 個人シートの最終行のエンゲージメントステータスを更新
6. `ratingRowNumber`が指定されている場合、Ratingシートも更新

**戻り値**：`{engagement, vigor, dedication, absorption}` またはデータがない場合は`{}`。

### `_syncSheetToAll(sourceSheet, targetSheet, sheetName)`

ソースシートからターゲットシートへ、ターゲットに存在しない年月のデータのみを追記する。カラム数の差はパディングまたはトリムで調整する。

### `_writePersonMasterSheet(rating2Sheet, targetSS)`

MemberSSのメンバーデータとrating2シートの最終測定日を組み合わせてperson_masterシートを生成する。

**status / is_active の判定：**
- `leave === "leave"` → status=`"leave"`, is_active=`false`
- `leave === "absence"` → status=`"absence"`, is_active=`true`
- `leave === ""` → status=`"active"`, is_active=`true`

### `_updateEngagementStatus(sheet, engagementStatus, row)`

シートの特定行に4つのエンゲージメントスコア（E/V/D/A）を書き込む。

---

## validate_rating_sync.gs

### `validateRatingSync(year, month, autoFix)`

Ratingシートと個人シートの間で分析フィールドを比較する。

```javascript
function validateRatingSync(year = null, month = null, autoFix = false) → Object
```

**比較フィールド**（17項目）：level, trend_base, trend_recent, trend_refined, big_change, stability_6, E_delta_1, E_delta_1_prev, E_delta_1_std_12, E_slope_6, E_slope_6_std_12, V/D/A_delta_1, V/D/A_slope_6。

**戻り値：**
```javascript
{
  year, month,
  totalChecked: number,     // 両シートにデータがあるメンバー数
  mismatches: Array,        // [{member, address, yearMonth, ratingRowNumber, fields}]
  fixed: Array,             // 自動修正された項目（同じ構造）
  errors: Array             // [{member, address, issue}]
}
```

### `normalizeValue(value)`

`null`、`undefined`、`""`、`0`を同等として扱う。数値は小数点以下10桁に丸める。

### `fixMismatch(individualRow, ratingRowNumber, fieldsToCompare)`

個人シートの行からRatingシートに各フィールドをコピーする。

**正のソース**：個人シート（Reportの`makeIndividualSheet()`で先に書き込まれるため）。

### `scanRecentMonths(autoFix)`

過去6か月分を`validateRatingSync()`のループで検証する。

```javascript
function scanRecentMonths(autoFix = false) → Array<Object>
```

---

## initial_setup.gs

### `setUpSheets()`

ConfigurationSSから全スプレッドシートIDを読み取ってログ出力する初回セットアップ関数。初期デプロイ後に設定が正しいか確認するために使用する。

---

## utilities.gs

### `getCurrentDayParts(inputDate)`

Dateオブジェクトからyear, month, dayを抽出する。

```javascript
function getCurrentDayParts(inputDate) → {year: number, month: number, day: number}
```

注意：`month`は1ベース（1月 = 1）。

### `setResponseDate(recordedDate)`

`Deadline`定数に基づいて回答日を調整する。

```javascript
function setResponseDate(recordedDate) → Date
```

- 回答日 ≤ `Deadline`（10日）：前月末日を返す（`DateUtil.getPreviousMonthEndDate()`経由）
- 回答日 > `Deadline`：元の日付を返す

`DateUtil`はReportプロジェクトから提供される共有ライブラリ。

---

## プロジェクト間の依存関係

### Reportから（上流）

| Adminが読み取るもの | 場所 | 説明 |
|---|---|---|
| Ratingシートデータ | `RatingSS.rating` | 1人1月あたりの分析結果 |
| 個人シート | `RatingSS.[名前]` | 同期検証用の個人別シート |
| `DateUtil` | 共有ライブラリ | 日付操作ユーティリティ |

### WE-Dashboardへ（下流）

| Adminが書き込むもの | 場所 | ダッシュボードでの用途 |
|---|---|---|
| rating2データ | `EngagementMasterSS.rating2` | 主要データソース — シグナルテーブル、チャート、個人分析 |
| commentデータ | `EngagementMasterSS.comment` | 時系列・個人タブでのコメント表示 |
| ratingデータ | `EngagementMasterSS.rating` | 因子別ビュー |
| evaluationデータ | `EngagementMasterSS.evaluation` | 評価タブ |

### データ契約：rating2シート

46列の`RATING2_HEADERS`配列がAdminとWE-Dashboard間の正確なデータ契約を定義する。WE-Dashboardの`data_loader.py`はこれらのカラムを名前で読み取り、`signal_processing.py`はシグナルカラム（big_change, stability_6, intervention_priority_neg/pos, flag_constant_6mなど）を直接参照する。

カラム名の変更は以下の3箇所で同期する必要がある：
1. `Admin/engagement_management.gs` → `RATING2_HEADERS`
2. `Report/evaluate.gs` → `ENGAGEMENT_RESULT_FIELDS`
3. `WE-Dashboard/modules/config.py` → `SIGNAL_LABELS`, `SIGNAL_TABLE_COLUMNS`

**intervention_priority_neg の意味（誤解しやすい点）**

`intervention_priority_neg` は `calculateInterventionPriority()` が算出した neg スコアをそのまま格納する。このスコアには `flag_constant_6m` ボーナス（LOW_FIXED: +3 / MID_EVASION: +2 / HIGH_AVOIDANCE: +2 / FIX_SHIFTED: +4）がすでに含まれている。

`flag_constant_6m` カラム（文字列）はラベル表示専用であり、Dashboard 側でこの値をもとに再度ボーナスを加算すると二重計上になる。Dashboard（`signal_processing.py`）は `intervention_priority_neg` を加工せずに閾値比較と表示値計算に使用しなければならない。

詳細はTECHNICAL_SPEC.md「WE-Dashboardでの介入必要度の利用」を参照。
