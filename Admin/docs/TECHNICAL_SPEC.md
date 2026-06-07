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
| `rating2` | `RatingMasterSheet2` | **WE-Dashboardの主要データソース** — 1人1月あたり1行、全48列（分析結果・介入必要度・個人内変動指標 direction_6_p90/volatility_6_p90 を含む） |
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

### rating2シートのカラム（17–47）

rating2シートは共通カラムに加え、31の分析用フィールドを持つ（全48列）。direction_6_p90 / volatility_6_p90 の追加と E_slope_3m の移動により、従来の46列から48列へ拡張された。

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
| 26 | stability_6 | Report | 中期安定性（不変/不安定/やや不安定/安定/判定保留）※個人内基準 |
| 27 | direction_6_p90 | Report | 中期方向（上昇/下降/方向変化なし/判定保留）。個人内変動指標（過去窓 D6 の P90 を閾値） |
| 28 | volatility_6_p90 | Report | 中期波動（波動あり/波動なし/判定保留）。個人内変動指標（過去窓 R6 の P90 + 符号反転≥3） |
| 29 | intervention_priority_neg | **Admin** | 負方向の介入必要度スコア（本プロジェクトで算出） |
| 30 | intervention_priority_pos | **Admin** | 正方向の介入必要度スコア（本プロジェクトで算出） |
| 31 | strength_short | Report | 短期の強みコンポーネント |
| 32 | weakness_short | Report | 短期の弱みコンポーネント |
| 33 | strength_mid | Report | 中期の強みコンポーネント |
| 34 | weakness_mid | Report | 中期の弱みコンポーネント |
| 35–39 | 統計指標 | Report | E_delta_1, E_delta_1_prev, E_delta_1_std_12, E_slope_6, E_slope_6_std_12 |
| 40 | E_slope_3m | Report | 3期OLS傾き |
| 41–46 | 統計指標 | Report | V_delta_1, D_delta_1, A_delta_1, V_slope_6, D_slope_6, A_slope_6 |
| 47 | flag_constant_6m | **Admin** | 調査抵抗疑義フラグ（Admin内で算出：LOW_FIXED/MID_EVASION/HIGH_AVOIDANCE/FIX_SHIFTED/""） |

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
│                      │ 上昇中だが trend_recent│          │
│                      │ が下降系（下降/急落/  │          │
│                      │ 連続下降）＝下降反転   │ neg +1   │
│                      │ → pos ではなく neg     │ (振替)   │
├──────────────────────┼───────────────────────┼──────────┤
│ trend_refined        │ "低下継続"（持続的低下 │ neg +1   │
│                      │ の高止まり）。neg のみ │          │
│                      │ （上昇継続は加点なし） │          │
├──────────────────────┼───────────────────────┼──────────┤
│ trend_recent         │ 急上昇 → pos          │ +3       │
│（直近トレンド。      │ 連続上昇 → pos        │ +3       │
│ E_delta_1 から導出。 │ 上昇 → pos            │ +2       │
│ 生 E_delta_1 加点は  │ 急落 → neg            │ +3       │
│ 廃止し本項に一本化） │ 連続下降 → neg        │ +3       │
│                      │ 下降 → neg            │ +2       │
│                      │ 横ばい                │ 0        │
├──────────────────────┼───────────────────────┼──────────┤
│ big_change           │ "減少変化大"          │ neg +1   │
│                      │ "増加変化大"          │ pos +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ stability_6          │ "不安定"（方向不問）  │ neg +1   │
│                      │ "やや不安定"（方向不問）│ neg +1  │
├──────────────────────┼───────────────────────┼──────────┤
│ volatility_6_p90     │ "波動あり"（方向不問）│ neg +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ （E_delta_1_std_12 の段階スコアは廃止＝trend_recent と重複） │
├──────────────────────┼───────────────────────┼──────────┤
│ E_slope_6_std_12     │ |value| ∈ (0.25,0.5] │ +1       │
│ （|value|による段階、 │ |value| ∈ (0.5,1.0]  │ +2       │
│  符号でneg/pos判定） │ |value| ∈ (1.0,1.5]  │ +3       │
│                      │ |value| > 1.5         │ +4       │
├──────────────────────┼───────────────────────┼──────────┤
│ 直近3ヶ月トレンド    │ E_slope_3m <= -5.0    │ neg +1   │
│                      │ E_slope_3m >= 5.0     │ pos +1   │
├──────────────────────┼───────────────────────┼──────────┤
│ flag_constant_6m     │ LOW_FIXED → neg       │ +2       │
│（調査抵抗疑義、      │ MID_EVASION → neg     │ +1       │
│  Adminが算出。多くが │ HIGH_AVOIDANCE → neg  │ +1       │
│  毎月候補に出続けるの│ FIX_SHIFTED → neg     │ +3       │
│  を避けるため引下げ）│                       │          │
└──────────────────────┴───────────────────────┴──────────┘

最大値: neg=12（flag前）/ 15（FIX_SHIFTED +3 含む）, pos=10
（neg内訳例: base低下中+1、低下継続+1、trend_recent連続下降+3、stability+1、volatility+1、
 E_slope_6_std+4、slope_3m+1 = 12。big_change は低下継続と排他）
```

### スコアリング要素の閾値の意味

| シグナル | 閾値の根拠 |
|---------|-----------|
| **trend_base** | Report の `trend_base` 判定をそのまま反映。中長期トレンドの方向を最も単純に表す基礎シグナル（最大 ±1）。**下降反転の例外**: `trend_base="上昇中"` でも `trend_recent ∈ {下降, 急落, 連続下降}`（中期は上昇基調だが直近で下落に反転＝「低下危機」等の早期警戒）の場合は、上昇基調の pos +1 を **neg +1 に振り替える**。直近反転は E_delta_1 で neg +1 程度しか稼げない一方で上昇基調由来の pos 点に打ち消され、早期警戒対象がアクション候補に出ない問題への対処。上昇反転（`trend_base="低下中"` × `trend_recent` 上昇系＝回復）は対象外で従来どおり neg +1。**Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）。** |
| **trend_refined（低下継続）** | `trend_refined="低下継続"`（= base低下中＋直近は下降/横ばい＋大きな変化なし＋6か月の実下降 slope_ok）なら **neg +1**。大きく低下した後に低位で高止まりすると E_delta_1・傾きベースの加点が減衰し `trend_base` 低下中の neg +1 しか残らず候補から漏れるため、持続的低下を介入優先度に残す。`trend_base` 低下中(+1)との二重計上は意図的（stability＋volatility と同じ設計）。**neg のみ加点**（上昇継続＝pos 側には加点しない非対称）。**Playbook/we_analyzer.py と完全同期（we-system Section 3）。** |
| **trend_recent（直近トレンド）** | 直近変化の加点。`trend_recent` は Report が `E_delta_1`/`E_delta_1_prev` から導出する（急=\|Δ\|≥6、上昇/下降=2≤\|Δ\|<6、連続=2期連続\|Δ\|≥2、優先順位は「連続>急>通常」）。**生 E_delta_1 加点（旧）は同一ソースの重複のため廃止し本項に一本化**、かつ直近の寄与を厚くした。重みは **急=連続=±3、上昇/下降=±2、横ばい=0**（急と連続は同重み：連続が急を上書きする分類のため、持続的悪化＝連続下降が単発急落より軽くならないよう揃えた）。 |
| **big_change** | Report が算出した個人内 Z スコア（`|E_delta_1| / E_std_6 >= 2.4`）による異常変化フラグ。方向は値名に内包（"増加変化大" / "減少変化大"）。 |
| **stability_6** | **個人内基準**（過去 E_std_6 の P90/P75 を閾値とする完全個人内比較）。`"不安定"`（> P90）・`"やや不安定"`（> P75）のいずれも方向不問で neg +1。上昇局面の変動も負方向シグナルとして扱う。`"判定保留"`（過去有効 E_std_6 数不足）は +0。**Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）。** |
| **volatility_6_p90** | `"波動あり"`（個人内基準の反復的変動：過去窓 R6 の P90 超＋符号反転≥3）は方向不問で **neg +1**（中期指標のため短期判断を埋もれさせないよう -2 から引き下げ、stability_6 と同重み）。両方発火を許容（最大 neg +2）。**Playbook/we_analyzer.py の介入必要度ロジックと完全同期。** |
| **E_delta_1_std_12** | **介入優先度の段階スコアは廃止**。`E_delta_1_std = E_delta_1 / stdNorm` は trend_recent と同じ「今月の変化」を別正規化しただけで重複するため、直近変化を trend_recent に一本化した際に削除した（個人内基準の単月変化は big_change が ±1 で拾う）。※列自体は rating2 に残る（他用途）。 |
| **E_slope_6_std_12** | 6期傾きを長期標準偏差で正規化した値。ティア下限 0.25 は「緩やかな傾向」、1.5超は「強い傾向」を表す。下限を 0.25 に設定し、微弱なトレンドはスコアに含めない。**直近変化（trend_recent）とは別軸の中期トレンドなので存続。** |
| **直近3ヶ月トレンド** | E_slope_3m 単独で判定。`<= -5.0` で neg +1、`>= 5.0` で pos +1。閾値は we_analyzer.py / evaluate.gs の `TREND_SLOPE_3M`（= 5.0）に統一。 |
| **flag_constant_6m** | 調査回答の固定化疑義（中期指標）。`FIX_SHIFTED`（値が変わったが固定化が継続）が最も深刻（**+3**）。`LOW_FIXED`（低水準で固定）はエンゲージメント問題と固定化の複合リスクで **+2**。`MID_EVASION / HIGH_AVOIDANCE` は固定化自体の疑義で **+1**。**調査抵抗者の多くが毎月アクション候補に出続けるのを避けるため、従来（4/3/2/2）から引き下げた。** |

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

#### DELTATIERS — `E_delta_1_std_12` のティア定義（**廃止**）

> **このティアスコアは介入優先度から廃止された。** `E_delta_1_std_12 = E_delta_1 / stdNorm` は
> trend_recent と同じ「今月の変化」を別正規化しただけで重複するため、直近変化を trend_recent に
> 一本化した際に削除した（個人内基準の単月変化は big_change が ±1 で拾う）。以下は廃止前の定義（参考）。

`E_delta_1_std_12 = E_delta_1 / stdNorm`。stdNorm（= E_std_12 または E_std_6）は個人の長期的な月次変動幅を表す。

| ティア | `|E_delta_1_std_12|` の範囲 | 加点 | 意味 |
|--------|----------------------------|------|------|
| 1 | (1.0, 2.0] | +1 | 1〜2σ：やや大きな変化（通常変動の上端） |
| 2 | (2.0, 3.0] | +2 | 2〜3σ：統計的に有意な変化 |
| 3 | (3.0, 4.0] | +3 | 3〜4σ：稀な大変化 |
| 4 | (4.0, ∞) | +4 | 4σ 超：極めて稀な急変 |
| — | [0, 1.0] | 0 | 1σ 以内：通常の個人内変動として無視 |

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

#### TREND_SLOPE_3M = 5.0 — 直近3ヶ月トレンドの閾値

`E_slope_3m = (E[t] - E[t-2]) / 2` の単位は**生スコアの点数/月**（stdNorm で割らない非標準化値）。

```javascript
// 発火条件:
neg +1 :  E_slope_3m <= -5.0   // 直近3ヶ月で下降トレンド
pos +1 :  E_slope_3m >=  5.0   // 直近3ヶ月で上昇トレンド
```

| 項目 | 説明 |
|------|------|
| `5.0 点/月` | 3ヶ月間で 10.0 点の変化に相当。we_analyzer.py / evaluate.gs の `TREND_SLOPE_3M` と統一。この値未満（絶対値 < 5.0）は「トレンドとは言えない微小な揺れ」として無視 |
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

RatingシートのレコードとPersonシートの行を19の分析フィールドで比較する：
- `level`, `trend_base`, `trend_recent`, `trend_refined`
- `big_change`, `stability_6`
- `direction_6_p90`, `volatility_6_p90`
- `E_delta_1`, `E_delta_1_prev`, `E_delta_1_std_12`
- `E_slope_6`, `E_slope_6_std_12`
- コンポーネントdelta/slope（V/D/A）

**モード：**
- **検証のみ**（`autoFix = false`）：不整合を報告
- **自動修正**（`autoFix = true`）：個人シートからRatingシートに値をコピー（個人シートが正とする）
- **直近スキャン**（`scanRecentMonths()`）：過去6か月分を検証

**値の正規化**：`null`、`undefined`、`""`、`0`は同等として扱う。数値は浮動小数点の問題を避けるため小数点以下10桁で比較する。

## 保守：rating2 の列構成変更・全データ再構築

direction_6_p90 / volatility_6_p90 の追加や E_slope_3m の列移動など **rating2 の列構成を変更したとき**、`updateMaster()` は当月分のみを追記するため、過去月の行は旧列構成のまま残り Dashboard が読めなくなる。これを解消するのが `maintenance.gs` の **`rebuildAllRating2()`**。

- RatingSS の rating シート（`recalculateRatingSheet()` 実行済み・全波形・新カラム）を正として、全 (year, month) × 全メンバーの rating2 行を新レイアウト（48列）で作り直す（`getRatingsData` / `createRating2MasterToBeAdded` / `ensureRating2Headers` / `updateOrganizationData` を再利用）。介入優先度も新ロジックで再計算される。
- rating2 の既存データを全消去して書き直す**破壊的操作**。実行前にバックアップ推奨。rating / evaluation / comment は変更しない。

**デプロイ順序**：列構成変更時は ①Report `recalculateRatingSheet()` → ②（個人シート用）`remakeAllIndividualSheets()` → ③`rebuildAllRating2()` の順で実行する。`ColumnRating*` 定数（Globals.gs）は RatingSS の物理列順と一致させること（E_slope_3m=24, direction_6_p90=25, volatility_6_p90=26, V_delta_1 以降=27…）。

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

---

*最終更新: 2026-06-02（stability_6 を個人内基準（E_std_6 P90/P75）に変更・「やや不安定」追加・「判定保留」追加。介入必要度に「やや不安定」→ neg +1 を追加。direction_6_p90/volatility_6_p90 を stability_6 の直後（col 27-28）へ移動。Playbook/we_analyzer.py と完全同期）*

これにより遅れて回答するユーザーに対応する。例えば、1月8日の回答は12月の回答として処理される。
