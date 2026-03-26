# Admin - 技術仕様書

## システム概要

Adminは、Reportプロジェクト（分析エンジン）とWE-Dashboard（可視化ツール）の間を繋ぐ**データ統合ハブ**として機能するGoogle Apps Script（GAS）プロジェクトである。ReportプロジェクトのRatingSS（分析結果）を読み込み、組織データと介入必要度スコアを付加した上で、統合データをEngagementMasterSSに書き出す。EngagementMasterSSはWE-Dashboardが参照する唯一のデータソースである。

### システムアーキテクチャ上の位置づけ

```
┌─────────────────────────────────────────────────────────────┐
│                    データパイプライン                          │
│                                                              │
│  Google Forms → Report (RatingSS) → Admin → EngagementMasterSS → WE-Dashboard
│                                                              │
│  フォーム送信    分析エンジン       データ統合ハブ              可視化
│  （生の回答）   （evaluate.gs）    （本プロジェクト）          （Streamlit）
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**上流（Reportプロジェクト）：**
- Reportは`evaluate.gs`を通じてフォーム送信を処理し、トレンド・レベル・統計指標を算出する
- 結果はRatingSS の`rating`シートと個人別シートに保存される
- Adminはこの`rating`シートからデータを読み取る

**下流（WE-Dashboard）：**
- WE-DashboardはEngagementMasterSSからエクスポートした`EngagementMasterSS.xlsx`を読み込む
- `rating2`シートをシグナルテーブル、チャート、個人分析の主要データソースとして使用する
- `comment`シートが懸念事項・コメントデータを提供する

## Googleスプレッドシート

Adminは複数のGoogleスプレッドシートと連携する。すべてのスプレッドシートIDは中央設定用スプレッドシート（ConfigurationSS）経由で参照される。

| スプレッドシート | 変数名 | 説明 |
|---|---|---|
| ConfigurationSS | `ConfigurationSS` | 中央設定 — 他の全スプレッドシートIDを管理 |
| AnswerSS | `AnswerSS` | フォーム生回答（"Form Responses 1"シート） |
| RatingSS | `RatingSS` | Reportの分析出力 — `rating`シート＋個人別シート |
| CommentSS | `CommentSS` | フォームからのコメント・懸念（`comments`シート） |
| MemberSS | `MemberSS` | メンバーマスタ（`members`シート） |
| NoEntrySS | `NoEntrySS` | 未回答メンバーの追跡 |
| EngagementMasterSS | `EngagementMasterSS` | **出力先** — 4つのマスタシート（下記参照） |
| SayingSS | `SayingSS` | 挨拶メッセージ（Reportのメール送信で使用） |
| AdviceSS | `AdviceSS` | アドバイスメッセージ（Reportのメール送信で使用） |
| MessageSS | `MessageSS` | ポジティブ心理学メッセージ |

### EngagementMasterSSのシート構成

EngagementMasterSSは4つのシートからなる中央データウェアハウスである。

| シート名 | 変数名 | 説明 |
|---|---|---|
| `rating` | `RatingMasterSheet` | 因子別ビュー — 1人1月あたり4行（E/V/D/A）、正規化済み0–10スコア |
| `rating2` | `RatingMasterSheet2` | **WE-Dashboardの主要データソース** — 1人1月あたり1行、全44列（分析結果・介入必要度を含む） |
| `evaluation` | `EvaluationMasterSheet` | エンゲージメントレベル評価（高い/中間/低い）と正規化スコア |
| `comment` | `CommentMasterSheet` | 1人1月あたりの懸念事項・コメントデータ |

## カラム構造

### 共通カラム（0–16）

4つのマスタシートすべてが同じ先頭17列を共有する。

| インデックス | カラム名 | 説明 |
|---|---|---|
| 0 | year | 測定年 |
| 1 | month | 測定月 |
| 2 | day | 回答日 |
| 3 | date | 回答日時（フル） |
| 4 | mail_address | メールアドレス（主キー） |
| 5 | name | 表示名 |
| 6 | division | 回答時の部門 |
| 7 | current_division | 現在の部門（`updateOrganizationData`で更新） |
| 8 | department | 回答時の部署 |
| 9 | current_department | 現在の部署 |
| 10 | section | 回答時の課 |
| 11 | current_section | 現在の課 |
| 12 | team | 回答時のチーム |
| 13 | current_team | 現在のチーム |
| 14 | project | 回答時のプロジェクト |
| 15 | current_project | 現在のプロジェクト |
| 16 | grade | 職位 |

`current_*`列は組織変更時に遡及的に更新される。これにより、ダッシュボードで過去データを現在の所属でグループ化して表示できる。

### rating2シートのカラム（17–44）

rating2シートは共通カラムに加え、28の分析用フィールドを持つ。

| インデックス | カラム名 | ソース | 説明 |
|---|---|---|---|
| 17 | engagement_rating | Report | 生のエンゲージメントスコア（0–54） |
| 18 | vigor_rating | Report | 生の活力スコア（0–18） |
| 19 | dedication_rating | Report | 生の熱意スコア（0–18） |
| 20 | absorption_rating | Report | 生の没頭スコア（0–18） |
| 21 | level | Report | エンゲージメントレベル（Critical/Low/Moderate/High/Thriving） |
| 22 | trend_base | Report | 基本トレンド（上昇中/低下中/安定/未評価） |
| 23 | trend_recent | Report | 短期トレンド（急落/連続下降/急上昇/連続上昇など） |
| 24 | trend_refined | Report | 精製中期トレンド（複数カテゴリ） |
| 25 | big_change | Report | 短期変動フラグ（変化大/安定） |
| 26 | stability_6 | Report | 中期安定性（安定/不安定/不変） |
| 27 | intervention_priority_neg | **Admin** | 負方向の介入必要度スコア（本プロジェクトで算出） |
| 28 | intervention_priority_pos | **Admin** | 正方向の介入必要度スコア（本プロジェクトで算出） |
| 29 | strength_short | Report | 短期の強みコンポーネント |
| 30 | weakness_short | Report | 短期の弱みコンポーネント |
| 31 | strength_mid | Report | 中期の強みコンポーネント |
| 32 | weakness_mid | Report | 中期の弱みコンポーネント |
| 33–44 | 統計指標 | Report | E_delta_1, E_slope_6, コンポーネントdelta/slopeなど |

### Ratingシート（RatingSS）のカラム

ReportプロジェクトのRatingシートは異なるカラムレイアウト（インデックス0–30）を持つ。Adminは`getRatingsData()`を通じてこれらを名前付きプロパティにマッピングして読み取る。

### Memberシートのカラム

| インデックス | カラム名 | 説明 |
|---|---|---|
| 0 | id | メンバーID |
| 1 | name | 表示名 |
| 2 | kana | カナ |
| 3 | alternativeName | 別名（evaluationシートで使用） |
| 4 | address | メールアドレス |
| 5–10 | division–grade | 組織階層 |
| 11 | leave | 休職フラグ（"Y" = 休職中） |

## コアデータフロー：`updateMaster()`

ReportからEngagementMasterSSへ1か月分のデータを転送するメインエントリーポイント：

```
updateMaster()
│
├── 1. 対象月を決定（前月）
│     └── 1月の場合 → 前年の12月
│
├── 2. MemberSSからメンバーリストを取得
│     └── getMemberList() → [{name, address, division, ...}]
│
├── 3. RatingSS からレーティングデータを取得
│     └── getRatingsData(year, month) → [{year, month, engagement, trends, ...}]
│
├── 4. 各レーティングをメンバーと紐づけ、マスタレコードを生成
│     └── createMasterDataToBeAdded(masterData, rating, member)
│           ├── createRatingMasterToBeAdded()   → 4行（E/V/D/A因子）
│           ├── createRating2MasterToBeAdded()  → 1行（44列）
│           │     └── calculateInterventionPriority(rating) → {neg, pos}
│           └── createEvaluationMasterToBeAdded() → 1行（エンゲージメントレベル）
│
├── 5. EngagementMasterSSに全レコードを書き込み
│     └── addToMasterRatingSheets(masterData)
│           ├── ratingシート ← masterData.ratings
│           ├── rating2シート ← masterData.ratings2（ヘッダー整合性チェック付き）
│           └── evaluationシート ← masterData.evaluations
│
├── 6. コメントの処理
│     ├── getCommentData(year, month) → [{concern, comment, ...}]
│     ├── updateCommentAttribute(year, month) → CommentSheetのメンバー情報を更新
│     └── addToMasterCommentSheet(commentData) → commentマスタに追記
│
└── 7. 全マスタシートの組織属性を更新
      └── updateOrganizationData(memberList)
            └── updateAttributes() × 4シート
```

## 介入必要度の算出

Adminの独自機能は`calculateInterventionPriority()`関数である。これはAdmin内の**唯一の分析ロジック**であり、それ以外はすべてデータ転送と組織管理である。

### アルゴリズム

この関数は2つの独立したスコアを算出する：`neg`（懸念シグナル）と`pos`（改善シグナル）。

```
入力: Reportからの全分析フィールドを持つratingオブジェクト
出力: { neg: number, pos: number }

スコアリング要素:
┌──────────────────────┬───────────────────────┬──────────┐
│ シグナル             │ 条件                  │ スコア   │
├──────────────────────┼───────────────────────┼──────────┤
│ trend_base           │ 低下中 → neg          │ +1       │
│                      │ 上昇中 → pos          │ +1       │
├──────────────────────┼───────────────────────┼──────────┤
│ trend_recent         │ 急落 → neg            │ +2       │
│                      │ 連続下降 → neg        │ +1       │
│                      │ 急上昇 → pos          │ +2       │
│                      │ 連続上昇 → pos        │ +1       │
├──────────────────────┼───────────────────────┼──────────┤
│ big_change           │ "変化大" + E_delta<0  │ neg +1   │
│                      │ "変化大" + E_delta>0  │ pos +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ stability_6          │ "不安定" + E_delta<0  │ neg +1   │
│                      │ "不安定" + E_delta>0  │ pos +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ E_delta_1_std_12     │ |value| ∈ (1,2]      │ +1       │
│ （|value|による段階、 │ |value| ∈ (2,3]      │ +2       │
│  符号でneg/pos判定） │ |value| ∈ (3,4]      │ +3       │
│                      │ |value| > 4           │ +4       │
├──────────────────────┼───────────────────────┼──────────┤
│ E_slope_6_std_12     │ |value| ∈ (0.25,0.5] │ +1       │
│ （|value|による段階、 │ |value| ∈ (0.5,1.0]  │ +2       │
│  符号でneg/pos判定） │ |value| ∈ (1.0,1.5]  │ +3       │
│                      │ |value| > 1.5         │ +4       │
├──────────────────────┼───────────────────────┼──────────┤
│ トレンド乖離         │ slope_6≥0 & slope_3m  │ neg +1   │
│（短期 vs 中期）      │   < -0.5              │          │
│                      │ slope_6≤0 & slope_3m  │ pos +1   │
│                      │   > 0.5               │          │
└──────────────────────┴───────────────────────┴──────────┘

最大値: neg=13, pos=13
```

### WE-Dashboardでの介入必要度の利用

WE-Dashboardの`signal_processing.py`は表示値を以下のように算出する：
- `neg > 閾値` または `pos > 閾値`（閾値 = 2）の行のみ表示
- 表示値 = `生の値 - 閾値`（最小表示値は1）
- 負方向のスコアは負の数、正方向は正の数として表示

## 組織データ管理

### 二重カラム戦略

各組織フィールドには2つのカラムがある：
- **回答時の値**（例：`division`）：回答時点の値 — 更新されない
- **現在の値**（例：`current_division`）：メンバーの異動時に遡及的に更新

これにより、WE-Dashboardで過去の正確性と現在の所属によるグループ化の両方が実現される。

### `updateOrganizationData()`

`updateMaster()`の最後に呼ばれる。以下の処理を行う：
1. 現在のメンバーリストを読み込む
2. 4つのマスタシートそれぞれで`current_*`列と`grade`を更新
3. 休職中のメンバー（`leave === "Y"`）：全組織フィールドをクリア
4. メンバーリストに存在しないメンバー：全組織フィールドをクリア（退職と見なす）
5. 差分のある行のみ書き込む（差分ベースの最適化）

### `updateMasterSheetAttributes()`

`maintenance.gs`内のスタンドアロンメンテナンス関数。全マスタシートのメンバー属性（名前、組織）を一括更新する。名前フィールドには`alternativeName`を使用する。`updateOrganizationData()`（差分ベース・行単位）とは異なり、シート全体を一括で書き換える。

## Rating同期検証

### 問題

Reportプロジェクトの`makeIndividualSheet()`は分析結果を個人シートとRatingシートの両方に書き込む。この二重書き込みが失敗した場合（レースコンディション、タイムアウト、手動編集）、シート間で不整合が発生し、EngagementMasterSSに不正なデータが書き込まれる。

### 解決策：`validate_rating_sync.gs`

RatingシートのレコードとPersonシートの行を17の分析フィールドで比較する：
- `level`, `trend_base`, `trend_recent`, `trend_refined`
- `big_change`, `stability_6`
- `E_delta_1`, `E_delta_1_prev`, `E_delta_1_std_12`
- `E_slope_6`, `E_slope_6_std_12`
- コンポーネントdelta/slope（V/D/A）

**モード：**
- **検証のみ**（`autoFix = false`）：不整合を報告
- **自動修正**（`autoFix = true`）：個人シートからRatingシートに値をコピー（個人シートが正とする）
- **直近スキャン**（`scanRecentMonths()`）：過去6か月分を検証

**値の正規化**：`null`、`undefined`、`""`、`0`は同等として扱う。数値は浮動小数点の問題を避けるため小数点以下10桁で比較する。

## 既知の問題と修正

### 行番号受け渡しのレースコンディション

**問題**：`recordEngagement()`がRatingシートに新しい行を書き込む際、返される行番号が無視されていた。その後`makeIndividualSheet()`が`getLastRow()`を使用するが、同時送信があった場合に異なる行を返す可能性があった。

**修正**：`recordEngagement()`の行番号を`ratingRowNumber`パラメータとして`makeIndividualSheet()`に渡す。パラメータのデフォルト値は`null`で、その場合は`getLastRow()`にフォールバックする（後方互換性を維持）。

詳細は`documents/FIX_race_condition.md`を参照。

## 定数

| 定数名 | 値 | 説明 |
|---|---|---|
| `MaxValueEngagement` | 54 | エンゲージメント生スコアの最大値（9項目 × 6点） |
| `MaxValueFactor` | 18 | 因子別生スコアの最大値（3項目 × 6点） |
| `MaxScale` | 10 | 正規化スケールの最大値 |
| `EngagementCriteriaHigh` | 32.4 | 高エンゲージメント閾値（グローバル標準: 36） |
| `EngagementCriteriaLow` | 10.8 | 低エンゲージメント閾値（グローバル標準: 27） |
| `Deadline` | 10 | 前月データの回答受付期限（月末からX日後まで） |
| `ReportPeriod` | 6 | レポート/メール/コメント用のデータ期間（月数） |
| `AnalysisPeriod` | 16 | 分析/分位数計算/個人シート用のデータ期間（月数） |

## 回答日の調整

`setResponseDate()`関数は回答日を以下のルールで調整する：
- 回答日 ≤ `Deadline`（10日）の場合：**前月**の回答として扱う（前月末日に調整）
- 回答日 > `Deadline`の場合：**当月**の回答として扱う

これにより遅れて回答するユーザーに対応する。例えば、1月8日の回答は12月の回答として処理される。
