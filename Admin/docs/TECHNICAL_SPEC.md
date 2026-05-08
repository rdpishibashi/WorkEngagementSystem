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
| EngagementMasterSS | `EngagementMasterSS` | **出力先** — 4つのマスタシート＋person_master（下記参照） |
| EngagementMasterAllSS | `EngagementMasterAllSS` | 全部門統合版 — rating2, comment, person_masterを含む |
| SayingSS | `SayingSS` | 挨拶メッセージ（Reportのメール送信で使用） |
| AdviceSS | `AdviceSS` | アドバイスメッセージ（Reportのメール送信で使用） |
| MessageSS | `MessageSS` | ポジティブ心理学メッセージ |

### EngagementMasterSSのシート構成

EngagementMasterSSは4つのシートからなる中央データウェアハウスである。

| シート名 | 変数名 | 説明 |
|---|---|---|
| `rating` | `RatingMasterSheet` | 因子別ビュー — 1人1月あたり4行（E/V/D/A）、正規化済み0–10スコア |
| `rating2` | `RatingMasterSheet2` | **WE-Dashboardの主要データソース** — 1人1月あたり1行、全46列（分析結果・介入必要度を含む） |
| `evaluation` | `EvaluationMasterSheet` | エンゲージメントレベル評価（高い/中間/低い）と正規化スコア |
| `comment` | `CommentMasterSheet` | 1人1月あたりの懸念事項・コメントデータ |
| `person_master` | — | メンバーマスタ（status, is_active, last_measured_date含む） |

### EngagementMasterAllSSのシート構成

EngagementMasterAllSSは全部門統合版であり、`syncToEngagementMasterAll()`でEngagementMasterSSからデータが同期される。

| シート名 | 変数名 | 説明 |
|---|---|---|
| `rating2` | `RatingMasterAllSheet2` | 全部門のrating2データ（EngagementMasterSSから同期） |
| `comment` | `CommentMasterAllSheet` | 全部門のcommentデータ（EngagementMasterSSから同期） |
| `person_master` | — | メンバーマスタ（`updatePersonMasterAllSheet()`で生成） |

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

### rating2シートのカラム（17–45）

rating2シートは共通カラムに加え、29の分析用フィールドを持つ。

| インデックス | カラム名 | ソース | 説明 |
|---|---|---|---|
| 17 | engagement_rating | Report | 生のエンゲージメントスコア（0–54） |
| 18 | vigor_rating | Report | 生の活力スコア（0–18） |
| 19 | dedication_rating | Report | 生の熱意スコア（0–18） |
| 20 | absorption_rating | Report | 生の没頭スコア（0–18） |
| 21 | level | Report | エンゲージメントレベル（Critical/Low/Moderate/High/Thriving） |
| 22 | trend_base | Report | 基本トレンド（上昇中/低下中/安定/未評価） |
| 23 | trend_recent | Report | 短期トレンド（急落/連続下降/急上昇/連続上昇など） |
| 24 | trend_refined | Report | 精製中期トレンド（複数カテゴリ）。傾き判定は `slopeOk = |E_slope_6|>2.0 OR |E_slope_3m|>=5.0` を使用 |
| 25 | big_change | Report | 短期変動フラグ（変化大/安定） |
| 26 | stability_6 | Report | 中期安定性（安定/不安定/不変） |
| 27 | intervention_priority_neg | **Admin** | 負方向の介入必要度スコア（本プロジェクトで算出） |
| 28 | intervention_priority_pos | **Admin** | 正方向の介入必要度スコア（本プロジェクトで算出） |
| 29 | strength_short | Report | 短期の強みコンポーネント |
| 30 | weakness_short | Report | 短期の弱みコンポーネント |
| 31 | strength_mid | Report | 中期の強みコンポーネント |
| 32 | weakness_mid | Report | 中期の弱みコンポーネント |
| 33–44 | 統計指標 | Report | E_delta_1, E_slope_6, コンポーネントdelta/slopeなど |
| 45 | flag_constant_6m | **Admin** | 調査抵抗疑義フラグ（Admin内で算出：LOW_FIXED/MID_EVASION/HIGH_AVOIDANCE/FIX_SHIFTED/""） |

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
| 11 | leave | 在籍ステータス（"" = 在籍, "absence" = 長期休職, "leave" = 退職・転属） |

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
├── 3b. RatingSS の全履歴から flag_constant_6m を算出
│     └── computeFlagConstant6mMap(year, month) → {address → flag}
│           └── 各アドレスごとに vigor/dedication/absorption の時系列で2パスアルゴリズムを実行
│                 ├── Pass 1: 3ヶ月ウィンドウで LOW_FIXED/MID_EVASION/HIGH_AVOIDANCE を判定
│                 └── Pass 2: 新規固定値ランの3ヶ月目のみ FIX_SHIFTED を判定（遷移元が既存フラグ状態の場合）
│
├── 4. 各レーティングをメンバーと紐づけ、マスタレコードを生成
│     ├── rating.flag_constant_6m = flagConstant6mMap[address] || ""
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
├── 7. 全マスタシートの組織属性を更新
│     └── updateOrganizationData(memberList)
│           └── updateAttributes() × 6シート
│                 （EngagementMasterSS 4シート ＋ EngagementMasterAll 2シート）
│
└── 8. person_masterシートを更新
      └── updatePersonMasterSheet()
            └── _writePersonMasterSheet(RatingMasterSheet2, EngagementMasterSS)
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
│ E_delta_1            │ >= 6.0 → pos          │ +2       │
│（直近変化量）        │ <= -6.0 → neg         │ +2       │
│                      │ [2.0, 6.0) → pos      │ +1       │
│                      │ (-6.0, -2.0] → neg    │ +1       │
│                      │ >=2.0 かつ             │          │
│                      │ E_delta_1_prev >=2.0  │ pos +1   │
│                      │ <=-2.0 かつ            │          │
│                      │ E_delta_1_prev <=-2.0 │ neg +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ big_change           │ "減少変化大"          │ neg +1   │
│                      │ "増加変化大"          │ pos +1   │
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
│ 直近3ヶ月トレンド    │ E_slope_3m <= -2.0    │ neg +1   │
│                      │ E_slope_3m >= 2.0     │ pos +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ flag_constant_6m     │ LOW_FIXED → neg       │ +3       │
│（調査抵抗疑義、      │ MID_EVASION → neg     │ +2       │
│  Adminが算出）       │ HIGH_AVOIDANCE → neg  │ +2       │
│                      │ FIX_SHIFTED → neg     │ +4       │
└──────────────────────┴───────────────────────┴──────────┘

最大値: neg=18, pos=14
```

### スコアリング要素の閾値の意味

| シグナル | 閾値の根拠 |
|---------|-----------|
| **trend_base** | Report の `trend_base` 判定をそのまま反映。中長期トレンドの方向を最も単純に表す基礎シグナル（最大 ±1）。 |
| **E_delta_1（直近変化量）** | `E_delta_1 ≥ 6.0` は急激な上昇として pos +2、`≤ -6.0` は急激な下降として neg +2。`[2.0, 6.0)` は緩やかな上昇 pos +1、`(-6.0, -2.0]` は緩やかな下降 neg +1。加えて今回・前回ともに同方向（±2以上）が続く場合に連続変化加点 ±1 を加える。 |
| **big_change** | Report が算出した個人内 Z スコア（`|E_delta_1| / E_std_6 >= 2.4`）による異常変化フラグ。方向は値名に内包（"増加変化大" / "減少変化大"）。 |
| **stability_6** | `"不安定"`（E_std_6 >= 3.3）は変動が大きく予測困難な状態。E_delta_1 の符号で現在の方向を判定。 |
| **E_delta_1_std_12** | 1期変化量を個人内長期標準偏差で正規化した値。段階ティア（1/2/3/4点）は標準偏差の何倍かを表し、大きいほど介入優先度が高い。ティア下限 1.0 は「1σ超」を意味する。 |
| **E_slope_6_std_12** | 6期傾きを長期標準偏差で正規化した値。ティア下限 0.25 は「緩やかな傾向」、1.5超は「強い傾向」を表す。下限を 0.25 に設定し、微弱なトレンドはスコアに含めない。 |
| **直近3ヶ月トレンド** | E_slope_3m 単独で判定。`<= -2.0` で neg +1、`>= 2.0` で pos +1。閾値 2.0 は we_analyzer.py の `TREND_SLOPE`（= `IP_SLOPE_3M_THRESHOLD`）に統一。 |
| **flag_constant_6m** | 調査回答の固定化疑義。`FIX_SHIFTED`（値が変わったが固定化が継続）が最も深刻（+4）。`LOW_FIXED`（低水準で固定）はエンゲージメント問題と固定化の複合リスクで +3。`MID_EVASION / HIGH_AVOIDANCE` は固定化自体の疑義で +2。 |

---

### ティアスコアの計算詳細

#### `getTieredScore(absValue, tiers)` の境界条件

ティアの境界は**下限 exclusive（開区間）・上限 inclusive（閉区間）**:

```
ティア [lower, upper, score] が発火する条件:  lower < absValue <= upper
```

| 境界値の例 | 挙動 |
|-----------|------|
| absValue がちょうど下限値（例: 1.0, 0.25）| スコア 0（下限は含まない） |
| absValue がちょうど上限値（例: 2.0, 0.50）| そのティアのスコアが加算される |
| 最大ティアの上限は `Infinity` | 4.0 超は常に +4、1.5 超は常に +4 |
| `""` / `null` / `0` | 加点なし（`null`/`""` はガード節でスキップ、`0` はいずれのティアにも入らない） |

---

#### DELTATIERS — `E_delta_1_std_12` のティア定義

`E_delta_1_std_12 = E_delta_1 / stdNorm`。stdNorm（= E_std_12 または E_std_6）は個人の長期的な月次変動幅を表す。

| ティア | `|E_delta_1_std_12|` の範囲 | 加点 | 意味 |
|--------|----------------------------|------|------|
| 1 | (1.0, 2.0] | +1 | 1〜2σ：やや大きな変化（通常変動の上端） |
| 2 | (2.0, 3.0] | +2 | 2〜3σ：統計的に有意な変化 |
| 3 | (3.0, 4.0] | +3 | 3〜4σ：稀な大変化 |
| 4 | (4.0, ∞) | +4 | 4σ 超：極めて稀な急変 |
| — | [0, 1.0] | 0 | 1σ 以内：通常の個人内変動として無視 |

**換算例（stdNorm = 3 の場合）**:

| ティア | E_delta_1 の目安（0-54 スケール） |
|--------|----------------------------------|
| 1 (+1) | 約 3〜6 点の変化（9問 × 0.3〜0.7 点/問 相当） |
| 2 (+2) | 約 6〜9 点の変化 |
| 3 (+3) | 約 9〜12 点の変化 |
| 4 (+4) | 12 点超の変化（全因子が 2 段階以上動く水準） |

> stdNorm が小さい人（変動が少ない）ほど、同じ点数変化でも高ティアになる。「その人にとって異常な変化か」という個人内相対評価であり、絶対的な点数変化ではなく個人の変動特性に基づく介入判断。

---

#### SLOPETIERS — `E_slope_6_std_12` のティア定義

`E_slope_6_std_12 = E_slope_6 / stdNorm`。E_slope_6 は直近 6 期の Theil-Sen 傾き（単位: 生スコアの点数/月）。

| ティア | `|E_slope_6_std_12|` の範囲 | 加点 | 意味 |
|--------|----------------------------|------|------|
| 1 | (0.25, 0.50] | +1 | 0.25〜0.5σ/月：緩やかなトレンド |
| 2 | (0.50, 1.00] | +2 | 0.5〜1σ/月：はっきりしたトレンド |
| 3 | (1.00, 1.50] | +3 | 1〜1.5σ/月：強いトレンド |
| 4 | (1.50, ∞) | +4 | 1.5σ/月 超：非常に強いトレンド |
| — | [0, 0.25] | 0 | 0.25σ/月 以内：統計的に微弱なトレンドとして無視 |

**換算例（stdNorm = 3 の場合）**:

| ティア | E_slope_6 の目安（点数/月） | 6ヶ月累積の変化量目安 |
|--------|--------------------------|---------------------|
| 1 (+1) | 約 0.75〜1.5 点/月 | 約 4.5〜9 点 |
| 2 (+2) | 約 1.5〜3.0 点/月 | 約 9〜18 点 |
| 3 (+3) | 約 3.0〜4.5 点/月 | 約 18〜27 点 |
| 4 (+4) | 4.5 点/月 超 | 27 点超（ほぼ全スケール移動） |

> ティア下限 0.25 は「月 0.75 点未満のトレンドはノイズ」という判断。E_slope_6 は Theil-Sen 推定のため外れ値に強く、一時的な急変の影響を受けにくい。

---

#### IP_SLOPE_3M_THRESHOLD = 2.0 — 直近3ヶ月トレンドの閾値

`E_slope_3m = (E[t] - E[t-2]) / 2` の単位は**生スコアの点数/月**（stdNorm で割らない非標準化値）。

```javascript
// 発火条件:
neg +1 :  E_slope_3m <= -2.0   // 直近3ヶ月で下降トレンド
pos +1 :  E_slope_3m >=  2.0   // 直近3ヶ月で上昇トレンド
```

| 項目 | 説明 |
|------|------|
| `2.0 点/月` | 3ヶ月間で 4.0 点の変化に相当。we_analyzer.py の `TREND_SLOPE`（= `IP_SLOPE_3M_THRESHOLD`）と統一。この値未満（絶対値 < 2.0）は「トレンドとは言えない微小な揺れ」として無視 |
| 非標準化 | E_slope_3m は個人の変動幅に依らず同じ閾値を適用。変動の大きい人には感度が低く、変動の小さい人には感度が高い |
| E_slope_6 不使用 | 中期トレンドとの比較は行わず、直近3ヶ月のトレンド方向のみで判定 |

> **DELTATIERS / SLOPETIERS との違い**: E_slope_3m は直近の短期トレンド方向を単純に評価するシグナルであり、個人内標準化をしない代わりに処理が単純で、直近 3 点の生データから即座に算出できる。

### WE-Dashboardでの介入必要度の利用

WE-Dashboardの`signal_processing.py`は表示値を以下のように算出する：
- `intervention_priority_neg > 閾値` または `intervention_priority_pos > 閾値`（閾値 = 2）の行のみ表示
- 表示値 = `生の値 - 閾値`（最小表示値は1）
- neg が閾値を超える場合は pos より優先（赤色表示）。pos のみ超える場合は緑色表示

**重要: flag_constant_6m ボーナスの扱い**

`intervention_priority_neg` には、上記スコアリングテーブルの `flag_constant_6m` 行のボーナス（最大+4）がすでに含まれた状態で rating2 シートに書き込まれる。これは Admin（本プロジェクト）が `calculateInterventionPriority()` 内で算出・加算している。

**Dashboard 側では `flag_constant_6m` による加算を行ってはいけない。** `flag_constant_6m` カラムはラベル表示（調査抵抗疑義の種類を示す文字列）専用であり、計算への再利用は二重計上になる。

| カラム | Dashboard での扱い |
|--------|-------------------|
| `intervention_priority_neg` | そのまま閾値判定と表示値計算に使用（flag ボーナス込み） |
| `intervention_priority_pos` | そのまま閾値判定と表示値計算に使用（flag 処理なし） |
| `flag_constant_6m` | ラベル表示専用（計算に使わない） |

## 組織データ管理

### 二重カラム戦略

各組織フィールドには2つのカラムがある：
- **回答時の値**（例：`division`）：回答時点の値 — 更新されない
- **現在の値**（例：`current_division`）：メンバーの異動時に遡及的に更新

これにより、WE-Dashboardで過去の正確性と現在の所属によるグループ化の両方が実現される。

### `updateOrganizationData()`

`updateMaster()`の最後に呼ばれる。以下の処理を行う：
1. 現在のメンバーリストを読み込む
2. 4つのマスタシート＋EngagementMasterAllの2シートで`current_*`列と`grade`を更新
3. 退職・転属メンバー（`leave === "leave"`）：全組織フィールドをクリア
4. 長期休職メンバー（`leave === "absence"`）：在籍中と同じ扱い（組織フィールドを更新）
5. メンバーリストに存在しないメンバー：全組織フィールドをクリア（退職と見なす）
6. 差分のある行のみ書き込む（差分ベースの最適化）

### 在籍ステータス（leave）の3値

MemberSSの`leave`列は3つの値を取る：

| 値 | 意味 | `is_active` | 組織フィールド |
|---|---|---|---|
| `""` (空) | 在籍中 | `true` | MemberSSから更新 |
| `"absence"` | 長期休職（在籍中） | `true` | MemberSSから更新 |
| `"leave"` | 退職・転属 | `false` | クリア（空文字） |

この3値は以下の箇所で使用される：
- `updateAttributes()`：`leave === "leave"` の場合のみ組織フィールドをクリア。`absence`は在籍中と同じ扱い
- `_writePersonMasterSheet()`：`status`列にそのまま反映、`is_active = (status !== "leave")`
- WE-Dashboard：`members.yaml`の`leave`列でメンバーの表示/非表示を制御

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
