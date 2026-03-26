# モジュール API リファレンス

> Report プロジェクト (Google Apps Script)
> 最終更新: 2026-03-26

---

## 目次

1. [evaluate.gs — 分析エンジン](#1-evaluategs分析エンジン)
2. [set_globals.gs — グローバル設定](#2-set_globalsgsグローバル設定)
3. [send_response.gs — 応答処理](#3-send_responsegs応答処理)
4. [make_individual.gs — 個人別シート](#4-make_individualgs個人別シート)
5. [make_mail_contents.gs — メール本文生成](#5-make_mail_contentsgsメール本文生成)
6. [make_charts.gs — グラフ生成](#6-make_chartsgsグラフ生成)
7. [record_engagement.gs — データ記録](#7-record_engagementgsデータ記録)
8. [maintenance.gs — バッチ処理](#8-maintenancegsバッチ処理)
9. [utilities.gs — ユーティリティ](#9-utilitiesgsユーティリティ)

---

## 1. evaluate.gs（分析エンジン）

エンゲージメントスコアの時系列分析を担うコアモジュール。統計的手法によりトレンド・安定性・強み/弱みを算出する。

### 定数

#### 閾値パラメータ

| 定数 | 値 | 用途 |
|------|------|------|
| `TREND_SLOPE` | `0.5` | 絶対傾き閾値 |
| `TREND_SLOPE_STD` | `0.55` | 標準化傾き閾値 |
| `TREND_DELTA_STRONG` | `5.0` | trend_base フォールバック閾値（3–5件時の E_slope_3m 判定） |
| `TREND_DELTA` | `1.0` | 変化閾値（未使用） |
| `TREND_RECENT_DELTA` | `2.0` | trend_recent 上昇/下降閾値 |
| `BIG_CHANGE_PERSONAL_Z` | `2.4` | big_change 判定の Z 値閾値 |
| `CHANGE_TAG_THRESHOLD` | `6.0` | 急上昇/急落の閾値 |
| `LEVEL_THRIVING` | `43` | Thriving レベル閾値 (85%) |
| `LEVEL_CRITICAL` | `3` | Critical レベル閾値 (5%) |
| `LEVEL_HIGH` | `32` | High レベル閾値 (60%) |
| `LEVEL_LOW` | `11` | Low レベル閾値 (20%) |
| `STABILITY_RANGE_EPS` | `1e-6` | 不変判定の範囲閾値 |
| `STABILITY_STD_STABLE` | `1.0` | 安定判定の標準偏差閾値 (P25) |
| `STABILITY_MOMENTUM_STABLE` | `0.5` | 安定判定のモメンタム閾値 |
| `STABILITY_STD_UNSTABLE` | `3.3` | 不安定判定の標準偏差閾値 (P80) |
| `MID_WINDOW` | `6` | 中期分析ウィンドウ |
| `LONG_WINDOW` | `12` | 長期分析ウィンドウ |
| `SHORT_MIN_DELTA` | `2.0` | 短期強み/弱み最小変化量 |
| `Z_VDA_THRESHOLD` | `0.8` | V/D/A 判定の Z 値閾値 |
| `MIN_SLOPE_POS` | `0.20` | 中期強み最小傾き (正) |
| `MIN_SLOPE_NEG` | `-0.20` | 中期弱み最小傾き (負) |
| `MID_MIN_RECORDS` | `2` | 中期指標に必要な最小レコード数 |

#### フィールド定義

| 定数 | 型 | 説明 |
|------|------|------|
| `ENGAGEMENT_RESULT_FIELDS` | `Array(22)` | 出力フィールド名一覧 |
| `NUMERIC_RESULT_FIELDS` | `Set` | 数値型フィールド |
| `MID_DEPENDENT_NUMERIC_FIELDS` | `Set` | 中期履歴依存の数値フィールド |
| `MID_DEPENDENT_STRING_FIELDS` | `Set` | 中期履歴依存の文字列フィールド |
| `REQUIRED_COLUMNS` | `Object` | 入力必須カラム名 |
| `DIMENSION_CONFIG` | `Array` | V/D/A 次元の設定 |
| `LABEL_TO_CODE` | `Object` | ラベル→コード変換 (`vigor`→`V` 等) |

---

### 関数

#### メイン分析関数

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `analyzeEngagement(data)` | `Array[]` (header + rows) | `Object` | メイン分析関数。22 フィールドの結果を返す |
| `prepareEngagementContext(data)` | `Array[]` | `{rows, hasMidHistory}` または `null` | データ検証・パース・ソート |
| `computeEngagementMetrics(rows, hasMidHistory)` | `Array, bool` | `{metrics, series}` | 数値指標計算 (delta, slope, std 等) |
| `computeStrengthAndWeakness(metrics, hasMidHistory)` | `Array, bool` | `void`（metrics を変更） | 適応的閾値による強み/弱み判定 |
| `evaluateStabilityTrendAndTags(metrics, series, hasMidHistory)` | `Array, Object, bool` | `void` | stability, trend, big_change, level 判定 |
| `classifyRecentTrend(delta, deltaPrev)` | `number, number` | `string` | trend_recent 分類 |
| `refineTrend(params)` | `{base, recent, slope, delta, E_std_6}` | `string` | trend_refined 決定 (13 カテゴリ) |
| `formatLatestResult(metrics, hasMidHistory)` | `Array, bool` | `Object` | 最新メトリクスのフォーマット |
| `levelFromEngagement(value)` | `number` | `string` | エンゲージメント値→レベル変換 |
| `calculateChangeTag(E_delta_1, E_std_6)` | `number, number` | `string` | big_change 判定 |
| `calcEngagement(engagementAnswers)` | `Array(9)` | `{engagement, vigor, dedication, absorption}` | 回答→スコア変換 |
| `engagementValue(answer)` | `string` | `number` | 日本語回答→数値変換 (0–6) |

#### 統計ユーティリティ

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `theilSenSlope(values, maxWindow)` | `Array, number` | `number` | Theil-Sen 傾き推定 |
| `computePersonalSlope(values, window)` | `Array, number` | `Array` | 各時点のローリング Theil-Sen 傾き |
| `computeMomentum(values)` | `Array` | `number` | 3 期モメンタム（最近 3 期平均 − 前 3 期平均） |
| `rollingRangeFull(values, window)` | `Array, number` | `Array` | ローリングレンジ (max − min) |
| `stdOfLast(values, window)` | `Array, number` | `number` | 直近 N 期の母標準偏差 |
| `collectLastFinite(values, window)` | `Array, number` | `Array` | 直近の有限値を N 個収集 |
| `mean(values)` | `Array` | `number` | 算術平均 |
| `median(values)` | `Array` | `number` | 中央値 |
| `quantile(values, q)` | `Array, number` | `number` | 分位数（線形補間） |
| `expandingQuantileExclusive(series, q)` | `Array, number` | `Array` | 拡張分位数（現在値除外） |
| `expandingRobustZExclusive(series)` | `Array` | `Array` | 拡張 MAD ベース Z-score（現在値除外） |

---

## 2. set_globals.gs（グローバル設定）

スプレッドシート・シートオブジェクトの初期化と、システム全体で共有する定数を定義するモジュール。

### 定数

| 定数 | 値 | 説明 |
|------|------|------|
| `FORM_ID` | (Google Forms ID) | アンケートフォーム ID |
| `SPREADSHEET_IDS` | `Object` | 7 つのスプレッドシート ID |
| `SHEET_NAMES` | `Object` | シート名マッピング |
| `MAX_RETRIES` | `3` | スプレッドシートアクセスリトライ回数 |
| `RETRY_DELAY_MS` | `60000` | リトライ間隔 (60 秒) |

### グローバル変数

| 変数 | 種別 | 説明 |
|------|------|------|
| `AnswerSS`, `RatingSS`, `CommentSS`, `MemberSS`, `SayingSS`, `AdviceSS`, `MessageSS` | Spreadsheet | 各スプレッドシートオブジェクト |
| `AnswerSheet`, `RatingSheet`, `CommentSheet`, `MemberSheet`, `ColumnSheet` | Sheet | 各シートオブジェクト |
| `Members` | `Array` | MemberSheet の全データ配列 |

### 列インデックス定数

| 定数 | 値 | 対象シート | 説明 |
|------|------|-----------|------|
| `Year` / `Month` / `Day` / `DateLabel` / `Address` | `0`–`4` | rating | 基本情報列 |
| `Engagement` / `Vigor` / `Dedication` / `Absorption` | `5`–`8` | rating | スコア列 |
| `NameOnMember` | `1` | member | 氏名 |
| `AddressOnMember` | `4` | member | メールアドレス |
| `DivisionOnMember`〜`GradeOnMember` | `5`–`10` | member | 組織情報 |
| `LeaveOnMember` | `11` | member | 休職フラグ |
| `CountOnMember` | `12` | member | メール送信回数 |
| `ColumnCommentConcern` | `17` | comment | 気になること列 |
| `ColumnCommentComment` | `18` | comment | 意見列 |

### 評価スケール定数

| 定数 | 値 | 説明 |
|------|------|------|
| `MaxValueEngagement` | `54` | エンゲージメント最大値（生スコア） |
| `MaxValueEngagementFactor` | `18` | 各因子最大値 |
| `MaxScale` | `10` | 表示スケール最大値 |
| `HighCriteria` | `32.4` | 高基準（グローバル標準 36） |
| `LowCriteria` | `10.8` | 低基準（グローバル標準 27） |

### 関数

| 関数 | 説明 |
|------|------|
| `ensureSpreadsheets()` | 全スプレッドシート初期化（リトライ付き） |
| `setGlobals()` | `ensureSpreadsheets()` + 定数設定 |

---

## 3. send_response.gs（応答処理）

フォーム送信イベントを受け取り、分析・グラフ生成・メール送信までの一連のフローを制御するモジュール。

### 定数/変数

| 定数/変数 | 説明 |
|-----------|------|
| `TestMode` | PropertiesService の `'Operation Mode'` が `test` なら `true` |

### 関数

| 関数 | 引数 | 説明 |
|------|------|------|
| `sendResponse(e)` | `FormEvent` | メインエントリポイント。フォーム送信時に呼ばれる |
| `sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus, articleCount)` | 各種 | グラフ生成→メール送信 |
| `createFeedback(engagementStatus, individualData, name)` | `Object, Array, string` | フィードバック生成（2 ヶ月未満は固定メッセージ） |
| `createSaying(engagementStatus)` | `Object` | weakness_short から名言選択 |
| `getColumn(articleCount)` | `number` | 送信回数に基づくコラム記事取得 |
| `getSaying(category)` | `Array` | カテゴリに基づく名言取得 (V/D/A → vigor/dedication/absorption 変換) |

---

## 4. make_individual.gs（個人別シート）

個人ごとのスプレッドシートシートを生成・更新し、分析結果を書き込むモジュール。

### 定数

| 定数 | 値 | 説明 |
|------|------|------|
| `BASE_INDIVIDUAL_HEADER` | `Array(9)` | 個人シートの基本ヘッダー (year〜absorption) |
| `RESULT_HEADER_FALLBACK` | `Array(22)` | `ENGAGEMENT_RESULT_FIELDS` が未定義時のフォールバック |
| `RESULT_START_COLUMN` | `10` (= 9 + 1) | 分析結果の書き込み開始列 (J 列) |
| `LastIndividualData` | `Array` | キャッシュ用グローバル変数（メール生成に使用） |

### 関数

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `makeIndividualSheet(address, name, responseDate, period, ratingRowNumber)` | `string, string, Date, number, number?` | `Object` | 個人シート生成/更新 + `analyzeEngagement` 実行 |
| `ensureIndividualHeader(sheet)` | `Sheet` | `void` | ヘッダー行の確認/設定 |
| `getIndividualHeader()` | — | `Array` | 完全なヘッダー配列 |
| `getResultHeaders()` | — | `Array` | 分析結果フィールド名配列 |
| `ensureResultHeaders(sheet)` | `Sheet` | `void` | Rating シートの結果ヘッダー確認/設定 |
| `ensureColumnCapacity(sheet, requiredColumns)` | `Sheet, number` | `void` | シートの列数を必要数まで拡張 |

---

## 5. make_mail_contents.gs（メール本文生成）

エンゲージメント状況に応じたフィードバック文・アドバイス・コメント一覧を生成するモジュール。

### 関数

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `makeEngagementComment(engagementStatus, name)` | `Object, string` | `string` | トレンドベースのフィードバック生成 |
| `makeCommentList(address, responseDate, period)` | `string, Date, number` | `string` | 過去 N 月のコメント一覧 (Markdown 形式) |
| `getAdviceText(category, rank)` | `string, string` | `string` | ADVICE シートからアドバイス取得 |
| `extractFamilyName(fullName)` | `string` | `string` | 姓の抽出 |
| `parseCategories(factorString)` | `string` | `Array` | `"V, D"` → `["v", "d"]` |
| `formatCategoryDisplay(categories)` | `Array` | `string` | `["v","d"]` → `"活力、熱意"` |
| `combineAdviceSentences(sentences)` | `Array` | `string` | 複数アドバイスを接続詞で結合 |
| `appendParagraph(paragraphs, text)` | `Array, string` | `void` | 段落追加 |
| `appendToLastParagraph(paragraphs, text)` | `Array, string` | `void` | 最後の段落に改行追加 |

### trendMessages（17 パターン）

| パターン |
|----------|
| 上昇加速 |
| 上昇継続 |
| 低下懸念 |
| 悪化 |
| 低下危機 |
| 低下加速 |
| 低下継続 |
| 回復期待 |
| 回復 |
| 復活 |
| 上昇期待 |
| 低下警戒 |
| 上昇 |
| 下降 |
| 横ばい |
| 安定維持 |

### CATEGORY_DISPLAY_NAMES

| キー | 表示名 |
|------|--------|
| `vigor` / `v` | 活力 |
| `dedication` / `d` | 熱意 |
| `absorption` / `a` | 没頭 |

---

## 6. make_charts.gs（グラフ生成）

個人レポート用のグラフ画像を生成するモジュール。全グラフ共通仕様: 幅 = 200 + データ数 × 50、高さ = 350。スケール変換は `raw / MaxValue * MaxScale`（0–10 スケール）。

### 関数

| 関数 | グラフ種類 | 入力 | 説明 |
|------|-----------|------|------|
| `individualEngagementChart(plotData)` | 棒グラフ | `chartData` | エンゲージメント推移（0–10 スケール） |
| `individualEngagementVariationChart(plotData)` | 折れ線グラフ | `chartData` | 月間増減 |
| `individualEngagementElementsChart(plotData)` | 折れ線グラフ | `chartData` | V/D/A 推移（色: orange / red / green） |

---

## 7. record_engagement.gs（データ記録）

フォーム回答をスプレッドシートに記録するモジュール。

### 関数

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `recordEngagement(address, responseDate, engagement, concern, comment)` | `string, Date, Object, string, string` | `number` | rating / comment シートにデータ追記。書き込み行番号を返す |

---

## 8. maintenance.gs（バッチ処理）

データ再計算・シート再作成・レポート送信などの管理・保守操作をまとめたモジュール。

### 関数

| 関数 | 引数 | 説明 |
|------|------|------|
| `recalculateRatingSheet()` | — | 全行再計算（ユーザー別時系列順、バルクライト） |
| `recalculateMonth(targetYear, targetMonth)` | `number, number` | 特定月の行のみ再計算 |
| `remakeAllIndividualSheets()` | — | 全個人シート再作成 |
| `recalculate202602()` | — | 2026 年 2 月再計算のショートカット |
| `sendReport()` | — | 指定メンバーのレポート送信（データ記録なし） |
| `recordAndSendReport()` | — | Answer シートから計算→記録→送信 |

---

## 9. utilities.gs（ユーティリティ）

システム共通のユーティリティ関数を提供するモジュール。

### 関数

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `setResponseDate(recordedDate)` | `Date` | `Date` | 10 日以内なら前月末日に調整 |
| `switchToTestMode()` | — | `void` | テストモードに切替 |
| `switchToOperationMode()` | — | `void` | 本番モードに切替 |
