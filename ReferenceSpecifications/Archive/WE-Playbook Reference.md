ご提示いただいた「元の文書（構成や外部仕様が詳しい）」と、私が作成した「技術詳細版（定数やロジックが詳しい）」を統合し、完全版の仕様書を作成しました。

---

# WEプレイブック出力仕様書（完全版）

**バージョン**: v2.2
**更新日**: 2025-11-22
**対象スクリプト**: `we_playbook.py`
**出力ファイル**: `we_playbook.xlsx`

---

## 1. 概要

### 1.1 目的
本ドキュメントは、ワーク・エンゲージメント（WE）分析スクリプトが出力するプレイブックの全仕様を定義する。
外部仕様（カラム定義・表示形式）に加え、内部仕様（判定ロジック・数理アルゴリズム・閾値定数）を詳細に記述する。

### 1.2 シート構成
出力ファイルは以下の4シートで構成され、順序も以下の通りとなる。

1.  **shortterm**: 最新Wave時点のメンバー短期状態（即応アクション判断用）
2.  **longterm**: 個人の長期傾向・特性サマリー（育成・配置戦略用）
3.  **monthly_trends**: 全員×全Waveの時系列データ（検証・分析用）
4.  **LatestIndividuals**: 最新Waveのみの時系列データ（monthly_trendsと同じ列構成）

### 1.3 入力データ要件
*   **必須列**: `year`, `month`, `mail_address` (または `name`), `vigor_rating`, `dedication_rating`, `absorption_rating`
*   **オプション列**: `engagement_rating`, `project`, `grade`, `section`, `group`
*   **Engagement計算**: `engagement_rating` が存在すれば優先使用。無い場合は `V+D+A` の合計値を使用。

---

## 2. 共通技術仕様（定数・アルゴリズム）

全シート共通で使用される定義および計算ロジック。

### 2.1 エンゲージメント・レベル定義 (`Level_A`)
Engagement値に基づき5段階に分類。

| レベル       | 閾値条件          | 定数名           |
| ------------ | ----------------- | ---------------- |
| **Thriving** | `Val > 43`        | `LEVEL_THRIVING` |
| **High**     | `32 < Val <= 43`  | `LEVEL_HIGH`     |
| **Moderate** | `11 <= Val <= 32` | (Else)           |
| **Low**      | `3 <= Val < 11`   | `LEVEL_LOW`      |
| **Critical** | `Val < 3`         | `LEVEL_CRITICAL` |

### 2.2 バンド化定義（エピソード分析用）
エピソード指標（回復回数など）の計算時は、レベルを3つのバンドに集約する。

*   **High群**: Thriving, High
*   **Mid群**: Moderate
*   **Low群**: Low, Critical

### 2.3 主要定数（閾値）

| カテゴリ       | パラメータ       | 値      | 定数名                        | 備考                           |
| -------------- | ---------------- | ------- | ----------------------------- | ------------------------------ |
| **トレンド**   | 傾き（正/負）    | `±0.35` | `TREND_SLOPE_POS/NEG`         | 6ヶ月Theil-Sen傾き判定         |
|                | モメンタム（強） | `±1.5`  | `TREND_MOMENTUM_STRONG`       | 3ヶ月モメンタム判定            |
|                | 変化量（強）     | `±5.0`  | `TREND_DELTA_STRONG`          | 前月差分(`delta_1`)判定        |
|                | 変化量（通常）   | `±1.0`  | `TREND_DELTA`                 | 有意な変化の最小幅             |
| **安定性(短)** | 安定上限(SD)     | `1.0`   | `STABILITY_STD_STABLE`        | `E_std_6` がこれ以下なら安定   |
|                | 不安定下限(SD)   | `2.5`   | `STABILITY_STD_UNSTABLE`      | `E_std_6` がこれ以上なら不安定 |
| **安定性(長)** | 安定上限(SD)     | `1.5`   | `STABILITY_STD_STABLE_LONG`   | `E_std_12` 判定用              |
|                | 不安定下限(SD)   | `3.0`   | `STABILITY_STD_UNSTABLE_LONG` | `E_std_12` 判定用              |
| **その他**     | 変化タグ閾値     | `6.0`   | `CHANGE_TAG_THRESHOLD`        | `ChangeTag` 付与基準           |
|                | 不変期間         | `183`日 | `CONSTANT_PERIOD_DAYS`        | 入力疑義判定用                 |

### 2.4 統計計算アルゴリズム

1.  **Theil-Sen Estimator (`_theil_sen_slope_window`)**
    *   **用途**: `E_slope_6`, `E_slope_12` 等のトレンド傾き算出。
    *   **ロジック**: 期間内の全データペアの傾きを計算し、その中央値を採用する。外れ値（スパイク的な変動）の影響を受けにくい。
2.  **Expanding Robust Z-score (`_expanding_robust_z_exclusive`)**
    *   **用途**: 個人内の短期・中期変化の特異点検出（`C_short_strength` 等）。
    *   **式**: $Z = (x - \text{Median}_{past}) / (1.4826 \times \text{MAD}_{past})$
    *   **特徴**: 当該月を除いた「過去データすべて（expanding）」の中央値とMAD（中央絶対偏差）を使用し、正規分布を仮定しない異常検知を行う。

---

## 3. shortterm シート詳細

**目的**: 最新Wave（月）時点のメンバーの短期状態と即応アクション判断のためのビュー。
**行粒度**: 1レコード = 1人 × 最新Wave

### 3.1 外部仕様（列定義）

| 列名                        | 型/表示       | 意味・備考                                                   |
| --------------------------- | ------------- | ------------------------------------------------------------ |
| `__person__`                | 文字列        | 個人ID（mail_addressを小文字・trim正規化）                   |
| `name`                      | 文字列        | 氏名                                                         |
| `project` / `grade`         | 文字列        | 属性情報                                                     |
| `__section__` / `__group__` | 文字列        | 所属情報                                                     |
| `__wave__`                  | 日付(yyyy-mm) | Wave（月末Timestamp）                                        |
| `Level_A`                   | カテゴリ      | Thriving / High / Moderate / Low / Critical                  |
| `Trend_B_refined`           | カテゴリ      | 短期トレンド（13種類、後述）                                 |
| `InterventionPriority`      | 整数          | 介入優先度スコア（値が高いほど優先）                         |
| `flag_constant_6m`          | 真偽          | 直近6ヶ月以上、E/V/D/Aが完全不変ならTRUE                     |
| `ShortTerm_ArchetypeJP`     | 文字列        | `Level_A × Trend_B_refined`                                  |
| `AnalysisFlag`              | カテゴリ      | `flag_constant_6m=TRUE ∧ Trend_B_refined=安定維持` → `分析不可（入力疑義）` |

### 3.2 内部仕様（判定ロジック）

#### 1. Trend_B_refined（詳細トレンド判定）
ベーストレンド（`Trend_B_base`: 傾きによる上昇中/低下中/安定）に対し、直近の変化（`delta_1`）、モメンタム、加速度を組み合わせて判定する。

*   **判定フロー（優先度順）**:
    1.  **加速/急変系**: `上昇加速`, `低下加速`, `悪化` (上昇→急落), `回復` (低下→急騰)
    2.  **継続系**: `上昇継続`, `低下継続`
    3.  **予兆系**: `低下危機` (上昇中だが急落し過去6ヶ月最小値を下回る), `復活` (低下中だが急騰し過去6ヶ月最大値を上回る)
    4.  **期待/警戒系**: `上昇期待` (安定→上昇), `低下警戒` (安定→下降), `低下懸念` (上昇→横ばいで微減)
    5.  **維持**: `安定維持`
    6.  **未評価**: 履歴不足（`MID_MIN_RECORDS < 3`）

#### 2. InterventionPriority（介入優先度スコア）
以下の要素を加算し、整数値で出力する。

*   **ベーススコア**:
    *   `低下加速`: +10, `低下危機`: +8, `悪化`: +6, `低下継続`: +4
    *   `復活`: +2, `回復`: +3, `低下懸念`: +2, `低下警戒`: +1, `上昇加速`: +1
    *   その他: 0
*   **レベル補正**: `Level_A` が `Low` または `Critical` なら **+1**
*   **変化幅補正**: `|E_delta_1| >= 6.0` の場合、負の変化なら **+2**、正の変化なら **+1**
*   **安定性補正**: `C_stability` が `不安定` なら **+1**
*   **タグ補正**: `ChangeTag` が `変化大` なら **+1**

#### 3. flag_constant_6m（入力妥当性チェック）
*   各人の時系列を走査し、`(Engagement, Vigor, Dedication, Absorption)` のタプルが変化しない連続区間を計測。
*   最長区間が **183日以上** の場合、`TRUE` とする。

---

## 4. longterm シート詳細

**目的**: 個人の**全期間**の傾向・特性を凝縮し、人材育成・配置の指針を与える。
**行粒度**: 1レコード = 1人（全期間集計）

### 4.1 外部仕様（列定義）

| 列名                         | 型/表示      | 意味・備考                                  |
| ---------------------------- | ------------ | ------------------------------------------- |
| `__person__` / `name`        | 文字列       | ID・氏名                                    |
| `slope3m_pattern`            | カテゴリ     | 長期推移パターン（Net Growth / U-Shape 等） |
| `episodes_recovery_from_low` | 整数         | Low→(Mid/High) への転換回数（全期間）       |
| `episodes_fall_to_low`       | 整数         | (Mid/High)→Low への転換回数（全期間）       |
| `pct_high` / `mid` / `low`   | 数値(0.00)   | 各バンドの滞在比率（全期間）                |
| `low_streak_max`             | 整数         | 連続Lowの最長長さ（全期間）                 |
| `episodes_low_2plus`         | 整数         | 連続Low≧2 のエピソード数（全期間）          |
| `Long_trait_strength`        | 文字列       | 長期の強み（同率最頻は複数カンマ列挙）      |
| `Long_trait_strength_V/D/A`  | 文字列(Y/空) | 各次元がトップに含まれるか                  |
| `Long_trait_strength_conf_*` | 数値(0.00)   | 各次元の支持率（出現数/総出現数）           |
| `Long_trait_weakness`        | 文字列       | 長期の弱み（同率最頻は複数カンマ列挙）      |

### 4.2 内部仕様（判定ロジック）

#### 1. slope3m_pattern（長期推移パターン）
全期間の月次傾き（`slope_3m`）の分布から判定。データ点数3未満は `Insufficient`。

*   **Net Growth**: 正の傾きの割合 ≥ 70% (`PATTERN_DOMINANCE_RATIO`) かつ 平均傾き > 0
*   **Net Decline**: 負の傾きの割合 ≥ 70% かつ 平均傾き < 0
*   **U-Shape**: 前半平均 < 0 かつ 後半平均 > 0
*   **Inverted-U**: 前半平均 > 0 かつ 後半平均 < 0
*   **Oscillating**: 符号反転回数が2回以上
*   **Flat/Noisy**: 上記以外

#### 2. Long_trait_strength/weakness（長期特性）
各Waveの `C_trait_*`（セクション内相対評価）を全期間集計して決定。

*   **抽出条件**:
    1.  履歴数が `TRAIT_MIN_HISTORY` (6ヶ月) 以上。
    2.  対象レベル（HighまたはLow）の滞在比率が動的閾値を超えていること。
*   **動的閾値 (`_dynamic_level_ratio_threshold`)**:
    *   履歴が短い場合: 80% (`TRAIT_LEVEL_RATIO_MAX`) 必要
    *   履歴が長い場合: 60% (`TRAIT_LEVEL_RATIO_MIN`) まで緩和（12ヶ月かけて線形緩和）
*   **出力**: 条件を満たす場合、最頻出の次元（V/D/A）を出力。

#### 3. エピソード指標
全期間の `Level_A`（バンド化済み）時系列から算出。
*   **episodes_recovery_from_low**: Low群からMid/High群へ遷移した回数。
*   **low_streak_max**: Low群が連続した最大月数。

---

## 5. monthly_trends シート詳細

**目的**: 全メンバーの全Wave時系列データを含む検証・分析用シート。
**行粒度**: 1レコード = 1人 × 1Wave

### 5.1 外部仕様（列定義・主要抜粋）

| カテゴリ           | 列名                                     | 意味・備考                             |
| ------------------ | ---------------------------------------- | -------------------------------------- |
| **基本**           | `__wave__`, `Engagement`, `Level_A`      | 基本指標                               |
| **トレンド**       | `Trend_B_refined`, `ChangeTag`           | トレンド判定結果                       |
| **安定性**         | `C_stability`, `C_stability_long`        | 安定性評価                             |
| **個人内比較**     | `C_short_strength`, `C_mid_strength`     | 過去の自分と比較した強み               |
| **セクション比較** | `C_trait_strength`                       | セクション内での相対的強み             |
| **多層指標**       | `E_std_6`, `E_momentum_3`, `E_slope_6`   | 統計指標（6ヶ月SD, 3ヶ月モメンタム等） |
| **月次指標**       | `slope_3m`, `accel_3m`                   | 3点単回帰による月次傾き・加速度        |
| **エピソード**     | `episodes_recovery_from_low` (expanding) | **各Wave時点までの**累積回復回数       |
| **分布**           | `pct_high` (expanding)                   | **各Wave時点までの**累積High比率       |

### 5.2 内部仕様（判定ロジック）

#### 1. C_stability（短期安定性）
直近6ヶ月の変動特性を評価。

*   **不変**: `Range`（最大-最小）がほぼ0
*   **安定**: `E_std_6 <= 1.0` (`STABILITY_STD_STABLE`) **かつ** `|E_momentum_3| < 0.5`
*   **不安定**: `E_std_6 >= 2.5` (`STABILITY_STD_UNSTABLE`)
    *   *注: 不安定判定にモメンタムは使用しない（SDのみで判定）*
*   **やや安定**: 上記以外

#### 2. C_stability_long（長期安定性）
直近12ヶ月の変動特性を評価。

*   **持続安定**: `E_std_12 <= 1.5` **かつ** `|E_momentum_6| < 0.8`
*   **持続不安定**: `E_std_12 >= 3.0`

#### 3. 個人内 強み/弱み (`C_short/mid_strength`)
Expanding Robust Z-score を用いて、個人の過去の変動幅に対する異常値を検出する。

*   **短期 (Short)**: 前月差分 (`delta_1`) を評価
    *   **強み**: `delta_1` >= 過去90%tile **かつ** `delta_1 >= 2.0` **かつ** `Z >= 0.8`
    *   **弱み**: `delta_1` <= 過去10%tile **かつ** `delta_1 <= -2.0` **かつ** `Z <= -0.8`
*   **中期 (Mid)**: 6ヶ月傾き (`slope_6`) を評価
    *   **強み**: `slope_6` >= 過去90%tile **かつ** `slope_6 >= 0.2` **かつ** `Z >= 0.8`
    *   **弱み**: `slope_6` <= 過去10%tile **かつ** `slope_6 <= -0.2` **かつ** `Z <= -0.8`

#### 4. 特性 強み/弱み (`C_trait_strength`)
セクション内での相対位置（Z-score）を評価。

*   **強み**: `z_section >= 0.5`
*   **弱み**: `z_section <= -0.5`
*   直近12ヶ月（`TRAIT_WINDOW_MONTHS`）の判定結果を集計し、`longterm` シートのロジックで代表特性を表示。

#### 5. エピソード・分布指標 (Expanding計算)
*   **重要**: monthly_trends シートのエピソード指標（`episodes_*`, `pct_*`）は、**「そのWave時点までの累積値」** である。
*   これにより、時系列に沿って「回復率がどう変化してきたか」を分析可能。

---

## 6. LatestIndividuals シート詳細

**目的**: 最新Wave時点のメンバーの詳細データ。
**仕様**: monthly_trends シートから最新Wave（グローバル最大Wave）のレコードを抽出したもの。列構成は monthly_trends と完全に同一。
**注記**: ここに含まれるエピソード指標は、全期間（最新時点まで）の累積値となるため、longterm シートの値と整合する。

---

## 7. 使用方法

### 7.1 実行コマンド
```bash
python3 we_playbook.py --input workengagement.xlsx --output we_playbook.xlsx
```

### 7.2 オプション
*   `--mid-window`: 中期トレンド判定のウィンドウサイズ（デフォルト: 6）

### 7.3 出力確認
実行後、以下のログが表示されれば正常終了。
```
✓ 完了: we_playbook.xlsx
  - shortterm: 最新Wave時点のメンバー短期状態
  - monthly_trends: 全員×全Wave の月次時系列
  - longterm: 個人の長期傾向・特性
  - LatestIndividuals: 最新Waveのみ
```