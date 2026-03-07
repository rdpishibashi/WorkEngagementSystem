# WE Analyzer 技術仕様書

> 対象ファイル: `we_analyzer.py`
> 最終更新: 2026-03-07

---

## 目次

1. [概要](#1-概要)
2. [出力指標の説明と計算式](#2-出力指標の説明と計算式)
3. [閾値一覧](#3-閾値一覧)
4. [判定指標の詳細](#4-判定指標の詳細)
   - [level](#41-level)
   - [trend_base](#42-trend_base)
   - [trend_recent](#43-trend_recent)
   - [trend_refined](#44-trend_refined)
   - [big_change](#45-big_change)
   - [big_change_abs](#46-big_change_abs)
   - [slope3m_pattern](#47-slope3m_pattern)
5. [intervention_priority_neg / intervention_priority_pos](#5-intervention_priority_neg--intervention_priority_pos)

---

## 1. 概要

`we_analyzer.py` は、ワーク・エンゲージメント（WE）の月次サーベイデータを入力として、個人ごとの多次元時系列分析を行い、トレンド判定・安定性評価・介入優先度スコアリングなどを出力するスクリプトである。

- **入力**: `EngagementMasterSS.xlsx`（シート `rating2`）
- **出力**: `we_report.xlsx`（2シート）
  - `monthly_trends` — 全員×全Wave の月次時系列
  - `latest_individuals` — 最新Wave のみ（monthly_trends と同一列構成）

### 基本データ項目

| 項目 | カラム名 | 値域 | 説明 |
|------|---------|------|------|
| Vigor | `vigor` | 0–18 | 活力 |
| Dedication | `dedication` | 0–18 | 献身 |
| Absorption | `absorption` | 0–18 | 没頭 |
| Engagement | `engagement` | 0–54 | V + D + A の合計 |

---

## 2. 出力指標の説明と計算式

### 2.1 差分・変化量

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_delta_1` | `E[t] - E[t-1]` | エンゲージメントの前月差分 |
| `E_delta_1_prev` | `E[t-1] - E[t-2]` | 前々月からの差分（連続性判定用） |
| `V_delta_1` / `D_delta_1` / `A_delta_1` | `X[t] - X[t-1]` | 各次元の前月差分 |
| `E_delta_1_std_6` | `E_delta_1 / E_std_6` | 6ヶ月標準偏差で標準化した差分 |
| `E_delta_1_std_12` | `E_delta_1 / E_std_12` | 12ヶ月標準偏差で標準化した差分 |

### 2.2 移動平均

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_mean_3` | `mean(E[t-2:t])` | 直近3ヶ月移動平均 |
| `E_mean_6` | `mean(E[t-5:t])` | 直近6ヶ月移動平均 |
| `E_ma3` | `rolling(3).mean()` | 3ヶ月移動平均（monthly_metrics 用） |

### 2.3 標準偏差・分散

| 指標 | 計算式 | 必要データ数 | 説明 |
|------|--------|-------------|------|
| `E_std_6` | `std(E[t-5:t], ddof=0)` | 6ヶ月以上 | 直近6ヶ月の母標準偏差 |
| `E_std_12` | `std(E[t-11:t], ddof=0)` | 12ヶ月以上 | 直近12ヶ月の母標準偏差 |
| `E_std_18` | `std(E[t-17:t], ddof=0)` | 18ヶ月以上 | 直近18ヶ月の母標準偏差 |
| `E_iqr_6` | `Q3(E[-6:]) - Q1(E[-6:])` | — | 直近6ヶ月の四分位範囲 |

### 2.4 傾き（Slope）

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_slope_6` | Theil-Sen slope（直近6点） | 6ヶ月ロバスト傾き |
| `E_slope_12` | Theil-Sen slope（直近12点） | 12ヶ月ロバスト傾き |
| `E_slope_6_std_6` | `E_slope_6 / E_std_6` | 6ヶ月傾きを6ヶ月標準偏差で標準化 |
| `E_slope_6_std_12` | `E_slope_6 / E_std_12` | 6ヶ月傾きを12ヶ月標準偏差で標準化 |
| `V_slope_6` / `D_slope_6` / `A_slope_6` | Theil-Sen slope（直近6点） | 各次元の6ヶ月ロバスト傾き |
| `E_slope_3m` | 3点OLS回帰傾き | 直近3点の単回帰による傾き |

**Theil-Sen slope の計算方法**:
- データ点数 < 2: `0.0`
- データ点数 2–5: 単純傾き `(arr[-1] - arr[0]) / (n - 1)`
- データ点数 6以上: 全ペア `(arr[j] - arr[i]) / (j - i)` の中央値

### 2.5 加速度・モメンタム

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_accel_6` | `E_slope_6[t] - E_slope_6[t-1]` | 6ヶ月傾きの1期差分（加速度） |
| `E_momentum_3` | `mean(E[-3:]) - mean(E[-6:-3])` | 直近3ヶ月平均 − 前3ヶ月平均 |
| `E_momentum_6` | `mean(E[-6:]) - mean(E[-12:-6])` | 直近6ヶ月平均 − 前6ヶ月平均 |
| `accel_3m` | 3点OLS回帰傾き（`E_slope_3m` に対して） | `E_slope_3m` の加速度 |

### 2.6 比率・分布

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `r_pos` | `count(E_slope_3m > 0) / N`（直近12ヶ月） | 正傾きの月の割合 |
| `r_neg` | `count(E_slope_3m < 0) / N`（直近12ヶ月） | 負傾きの月の割合 |
| `pct_high` | `累積 High 月数 / 累積全月数` | High バンド（Thriving+High）の累積割合 |
| `pct_mid` | `累積 Mid 月数 / 累積全月数` | Moderate バンドの累積割合 |
| `pct_low` | `累積 Low 月数 / 累積全月数` | Low バンド（Low+Critical）の累積割合 |
| `recovery_rate` | `episodes_recovery / episodes_fall` | 回復率（fall が 0 なら NaN） |
| `fall_rate` | `episodes_fall / 累積全月数` | 低下率 |

### 2.7 エピソード指標

| 指標 | 説明 |
|------|------|
| `episodes_recovery` | Low → Mid/High へ遷移した累積回数 |
| `episodes_fall` | Mid/High → Low へ遷移した累積回数 |
| `low_streak_max` | Low バンド連続月の最大記録 |
| `episodes_low2plus` | Low バンドが `LOW_EPISODE_THRESHOLD`（2）ヶ月以上続いたエピソード数 |

### 2.8 Z-score 関連

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `{V,D,A,E}_z_section` | `(val - group_mean) / group_std` | 部門（department）× Wave 内での Z-score |
| `{V,D,A,E}_z_group` | `(val - group_mean) / group_std` | セクション（section）× Wave 内での Z-score |

### 2.9 短期・中期 Strength/Weakness

| 指標 | 判定基準 | 説明 |
|------|---------|------|
| `short_strength` | 差分 ≥ max(個人P90, 2.0) かつ robust Z abs > 0.8 | 短期的な次元別強み（V, D, A） |
| `short_weakness` | 差分 ≤ min(個人P10, -2.0) かつ robust Z abs > 0.8 | 短期的な次元別弱み（V, D, A） |
| `mid_strength` | slope ≥ max(個人P90, 0.20) かつ robust Z abs > 0.8 | 中期的な次元別強み（V, D, A） |
| `mid_weakness` | slope ≤ min(個人P10, -0.20) かつ robust Z abs > 0.8 | 中期的な次元別弱み（V, D, A） |

### 2.10 特性（Trait）

| 指標 | 説明 |
|------|------|
| `trait_strength` | 直近12ヶ月で High バンド比率が動的閾値以上のとき、部門内 Z > 0.5 の最頻次元 |
| `trait_weakness` | 直近12ヶ月で Low バンド比率が動的閾値以上のとき、部門内 Z < -0.5 の最頻次元 |
| `trait_strength_conf_{V,D,A}` | 各次元の強み判定における確信度（当該次元の回数 / 全次元合計回数） |
| `trait_weakness_conf_{V,D,A}` | 各次元の弱み判定における確信度 |

**動的閾値** (`_dynamic_level_ratio_threshold`):
- 履歴 ≤ 6ヶ月: `0.8`
- 履歴 > 6ヶ月: `0.8` から `0.6` へ線形に緩和（減衰期間 12ヶ月）

### 2.11 安定性

| 指標 | 説明 |
|------|------|
| `stability_6` | 6ヶ月の安定性（不変 / 安定 / やや安定 / 不安定） |
| `stability_12` | 12ヶ月の安定性（完全不変 / 持続安定 / やや持続安定 / 持続不安定） |

### 2.12 入力品質フラグ

| 指標 | 条件 | 説明 |
|------|------|------|
| `flag_constant_6m` | V, D, A がすべて直近6ヶ月同一値 | 入力疑義フラグ |

---

## 3. 閾値一覧

### 3.1 傾き関連閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_SLOPE` | 0.5 | 中期傾き閾値（`trend_base`, `trend_refined` 判定） |
| `TREND_SLOPE_STD_MIN` | 0.2 | 標準化傾きの最小閾値（`trend_base` 判定） |
| `TREND_SLOPE_STD` | 0.55 | 標準化傾き閾値（全体の15%程度、`trend_base` 判定） |
| `MIN_SLOPE` | 0.20 | 個人傾きの最小閾値（`mid_strength`/`mid_weakness` 判定） |

### 3.2 変化量関連閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_DELTA_STRONG` | 5.0 | 強い変化の閾値（現在未使用） |
| `TREND_DELTA` | 1.0 | 変化閾値（現在未使用） |
| `TREND_RECENT_DELTA` | 2.0 | `trend_recent` の上昇／下降判定閾値 |
| `CHANGE_TAG_THRESHOLD` | 6.0 | 急上昇・急落の閾値（`trend_recent`, `big_change_abs`） |
| `BIG_CHANGE_PERSONAL_Z` | 2.4 | 個人内変化大の閾値（`big_change`, `_calculate_change_tag`） |

### 3.3 V/D/A 次元閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `Z_VDA_THRESHOLD` | 0.8 | robust Z-score 閾値（strength/weakness 判定） |
| `SHORT_VDA_MIN_DELTA` | 2.0 | 短期変化の最小差分閾値 |
| `SECTION_THRESHOLD` | 0.5 | 部門内 Z-score による特性判定閾値 |

### 3.4 レベル閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `LEVEL_THRIVING` | 43 | Thriving 判定（E > 43） |
| `LEVEL_HIGH` | 32 | High 判定（E > 32） |
| `LEVEL_LOW` | 11 | Low 判定（E < 11） |
| `LEVEL_CRITICAL` | 3 | Critical 判定（E < 3） |

### 3.5 安定性閾値（6ヶ月）

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_RANGE_EPS` | 1e-6 | E, V, D, A の6ヶ月レンジがこれ以下で「不変」 |
| `STABILITY_STD_STABLE` | 1.0 | E_std_6 がこれ未満で「安定」候補（25パーセンタイル） |
| `STABILITY_MOMENTUM_STABLE` | 0.5 | E_momentum_3 の絶対値がこれ未満で「安定」候補 |
| `STABILITY_STD_UNSTABLE` | 3.3 | E_std_6 がこれ超で「不安定」（80パーセンタイル） |

### 3.6 安定性閾値（12ヶ月）

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_STD_STABLE_LONG` | 1.5 | E_std_12 がこれ未満で「持続安定」候補 |
| `STABILITY_MOMENTUM_STABLE_LONG` | 0.8 | E_momentum_6 の絶対値がこれ未満で「持続安定」候補 |
| `STABILITY_STD_UNSTABLE_LONG` | 3.7 | E_std_12 がこれ超で「持続不安定」 |

### 3.7 履歴・エピソード関連

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `MID_MIN_RECORDS` | 2 | 中期トレンド計算に必要な最小レコード数 |
| `TRAIT_MIN_HISTORY` | 6 | 特性評価に必要な最小履歴数 |
| `LOW_EPISODE_THRESHOLD` | 2 | Low エピソード判定の連続月数閾値 |

### 3.8 特性評価

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TRAIT_WINDOW_MONTHS` | 12 | 特性評価の観測ウィンドウ |
| `TRAIT_MIN_PERIODS` | 3 | 最小期間 |
| `TRAIT_LEVEL_RATIO_MAX` | 0.8 | High/Low 比率上限（短期、履歴≤6ヶ月） |
| `TRAIT_LEVEL_RATIO_MIN` | 0.6 | High/Low 比率下限（長期、十分な履歴後） |
| `TRAIT_LEVEL_RATIO_DECAY` | 12 | 閾値を MAX → MIN に減衰させる期間 |
| `TRAIT_COUNT_EPS` | 1e-6 | 同率判定の許容誤差 |

### 3.9 slope3m_pattern 関連

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `SLOPE_PATTERN_WINDOW` | 12 | パターン判定ウィンドウ（月） |
| `NET_RATIO_THRESHOLD` | 0.7 | Net Growth/Decline の正負比率閾値 |
| `SLOPE12_THRESHOLD` | 0.4 | 12ヶ月傾きの絶対値閾値 |
| `SLOPE6_STD12_THRESHOLD` | 0.2 | 6ヶ月標準化傾きの絶対値閾値 |

---

## 4. 判定指標の詳細

### 4.1 level

エンゲージメント値（E）から5段階のレベルを判定する。関数 `_level_from_e` にて算出。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"Thriving"` | E > 43 | `LEVEL_THRIVING = 43` |
| `"High"` | 32 < E ≤ 43 | `LEVEL_HIGH = 32` |
| `"Moderate"` | 11 ≤ E ≤ 32 | — |
| `"Low"` | 3 ≤ E < 11 | `LEVEL_LOW = 11` |
| `"Critical"` | E < 3 | `LEVEL_CRITICAL = 3` |
| `""` | E が NaN | — |

**判定順序**（上から順に評価、最初にマッチしたものを返す）:
1. NaN → `""`
2. E > 43 → `"Thriving"`
3. E < 3 → `"Critical"`
4. E > 32 → `"High"`
5. E < 11 → `"Low"`
6. いずれにも該当しない → `"Moderate"`

**バンド化** (`bandify_level`): エピソード・特性評価で使用する3バンド分類。
- High バンド: `Thriving`, `High`
- Mid バンド: `Moderate`
- Low バンド: `Low`, `Critical`

---

### 4.2 trend_base

中期（6ヶ月）の傾きに基づくトレンド判定。関数 `apply_personal_trend_logic` 内で算出。

**前提条件**: `MID_MIN_RECORDS = 2` を超えるレコード数が必要。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"未評価"` | レコード数 ≤ `MID_MIN_RECORDS`（2） | `MID_MIN_RECORDS = 2` |
| `"上昇中"` | 条件A **または** 条件B を満たす | 下記参照 |
| `"低下中"` | 条件C **または** 条件D を満たす | 下記参照 |
| `"安定"` | 上記いずれにも該当しない（デフォルト） | — |

**条件の詳細**:

| 条件 | 式 | 参照閾値 |
|------|-----|---------|
| 条件A（上昇：傾き+標準化） | `E_slope_6 > 0.5` **AND** `E_slope_6_std_6 > 0.2` | `TREND_SLOPE = 0.5`, `TREND_SLOPE_STD_MIN = 0.2` |
| 条件B（上昇：標準化のみ） | `E_slope_6_std_6 > 0.55` | `TREND_SLOPE_STD = 0.55` |
| 条件C（低下：傾き+標準化） | `E_slope_6 < -0.5` **AND** `E_slope_6_std_6 < -0.2` | `TREND_SLOPE = 0.5`, `TREND_SLOPE_STD_MIN = 0.2` |
| 条件D（低下：標準化のみ） | `E_slope_6_std_6 < -0.55` | `TREND_SLOPE_STD = 0.55` |

**補足**: 条件B/D は標準化傾き（`E_slope_6_std_6`）が十分大きい場合、生の傾き（`E_slope_6`）の閾値チェックなしで上昇中/低下中と判定する。これにより、分散が小さい個人でも有意な傾きを検出できる。

---

### 4.3 trend_recent

短期（直近1–2ヶ月）の変化に基づくトレンド判定。関数 `apply_personal_trend_logic` 内で算出。

使用する値:
- `delta` = `E_delta_1`（前月差分）
- `delta_prev` = `E_delta_1_prev`（前々月差分）

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"急上昇"` | `delta ≥ 6.0` | `CHANGE_TAG_THRESHOLD = 6.0` |
| `"急落"` | `delta ≤ -6.0` | `CHANGE_TAG_THRESHOLD = 6.0` |
| `"連続上昇"` | `delta > 2.0` **AND** `delta_prev > 2.0` | `TREND_RECENT_DELTA = 2.0` |
| `"連続下降"` | `delta < -2.0` **AND** `delta_prev < -2.0` | `TREND_RECENT_DELTA = 2.0` |
| `"上昇"` | `2.0 < delta < 6.0` | `TREND_RECENT_DELTA = 2.0`, `CHANGE_TAG_THRESHOLD = 6.0` |
| `"下降"` | `-6.0 < delta < -2.0` | `TREND_RECENT_DELTA = 2.0`, `CHANGE_TAG_THRESHOLD = 6.0` |
| `"横ばい"` | 上記いずれにも該当しない（デフォルト） | — |

**優先順位**（numpy配列への代入順。後の代入が上書きするため、後の条件が優先される）:
1. `"下降"` / `"上昇"`（中程度の変化）
2. `"急落"` / `"急上昇"`（大きな変化）
3. `"連続下降"` / `"連続上昇"`（2期連続、最優先）

---

### 4.4 trend_refined

`trend_base` と `trend_recent` を統合した17カテゴリーの詳細トレンド判定。関数 `_refine_trend` にて算出。

**内部参照値**:
- `big_change`: `_calculate_change_tag()` で判定 → `"変化大"` or `"not 変化大"`
  - 条件: `|E_delta_1| / E_std_12 > BIG_CHANGE_PERSONAL_Z (2.4)` のとき `"変化大"`
- `E_slope_6`: 6ヶ月ロバスト傾き
- `E_delta_1`: 前月差分
- `flag_constant_6m`: 入力疑義フラグ

| 優先度 | 値 | trend_recent | trend_base | big_change | その他条件 |
|--------|-----|-------------|-----------|-----------|-----------|
| 0 | `"入力疑義"` | — | — | — | `flag_constant_6m == TRUE` |
| 1 | `"上昇加速"` | 上昇/急上昇/連続上昇 | 上昇中 | 変化大 | `|E_slope_6| > 0.5` |
| 1 | `"低下加速"` | 下降/急落/連続下降 | 低下中 | 変化大 | `|E_slope_6| > 0.5` |
| 2 | `"上昇継続"` | 上昇/急上昇/連続上昇/横ばい | 上昇中 | not 変化大 | `|E_slope_6| > 0.5` **AND** `E_delta_1 ≥ 0` |
| 2 | `"低下継続"` | 下降/急落/連続下降/横ばい | 低下中 | not 変化大 | `|E_slope_6| > 0.5` **AND** `E_delta_1 ≤ 0` |
| 3 | `"復活"` | 上昇/急上昇 | 低下中 | 変化大 | `|E_slope_6| > 0.5` |
| 3 | `"悪化"` | 下降/急落 | 上昇中 | 変化大 | `|E_slope_6| > 0.5` |
| 4 | `"回復"` | 上昇/急上昇/連続上昇 | 低下中 | not 変化大 | — |
| 4 | `"低下危機"` | 下降/急落/連続下降 | 上昇中 | not 変化大 | — |
| 5 | `"上昇期待"` | 上昇/急上昇/連続上昇 | 安定 | — | — |
| 5 | `"低下警戒"` | 下降/急落/連続下降 | 安定 | — | — |
| 6 | `"低下懸念"` | 横ばい | 上昇中 | — | `E_delta_1 < 0` |
| 6 | `"回復期待"` | 横ばい | 低下中 | — | `E_delta_1 > 0` |
| 7 | `"上昇"` | 上昇/急上昇 | 未評価 | — | — |
| 7 | `"下降"` | 下降/急落 | 未評価 | — | — |
| 7 | `"横ばい"` | 横ばい | 未評価 | — | — |
| 8 | `"安定維持"` | 横ばい | 安定 | — | — |
| 9 | `"安定維持"` | — | — | — | フォールバック（デフォルト） |

**参照閾値**:
- `TREND_SLOPE = 0.5`（`|E_slope_6|` チェック）
- `BIG_CHANGE_PERSONAL_Z = 2.4`（`big_change` 判定内部）
- `E_std_12` > 0（`big_change` 判定内部）

**設計上の注意**: 優先度1–3の `|E_slope_6| > TREND_SLOPE` チェックは冗長に見えるが、`trend_base` が条件B/D（標準化傾きのみ）で判定された場合、生の傾きが小さい可能性があるため必要。

---

### 4.5 big_change

個人の過去の変動幅に対する相対的な変化の大きさを判定する。`run()` 関数内で算出。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"変化大"` | `E_std_6 > 0` **AND** `|E_delta_1| / E_std_6 > 2.4` | `BIG_CHANGE_PERSONAL_Z = 2.4` |
| `""` | 上記に該当しない | — |

**計算式**:
```
big_change = "変化大"  if  E_std_6 > 0  AND  |E_delta_1| / E_std_6 > BIG_CHANGE_PERSONAL_Z
             ""         otherwise
```

**補足**: `E_std_6` が 0 以下（データ不足やゼロ分散）の場合は常に空文字となる。これにより、データが十分にない個人に対して誤って「変化大」と判定することを防いでいる。

---

### 4.6 big_change_abs

エンゲージメント差分の絶対値に基づく、個人間で共通の固定閾値での変化判定。`run()` 関数内で算出。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"変化大"` | `|E_delta_1| ≥ 6.0` | `CHANGE_TAG_THRESHOLD = 6.0` |
| `""` | `|E_delta_1| < 6.0` | — |

**計算式**:
```
big_change_abs = "変化大"  if  |E_delta_1| >= CHANGE_TAG_THRESHOLD
                 ""         otherwise
```

**`big_change` との違い**:
- `big_change`: **個人内相対評価**（個人の6ヶ月標準偏差で標準化して判定）
- `big_change_abs`: **絶対評価**（固定閾値6.0で判定）

---

### 4.7 slope3m_pattern

直近12ヶ月の `E_slope_3m`（3ヶ月OLS傾き）の時系列パターンを分類する。関数 `compute_slope3m_pattern` にて算出。

**使用する入力値**:
- `E_slope_3m` の直近12ヶ月分の時系列（`e_slope_3m_seq`）
- `E_slope_12`（最新値）
- `E_slope_6_std_12`（最新値）

**補助統計量**:
- `N`: 有効な（非NaN）`E_slope_3m` の個数
- `r_pos`: `E_slope_3m > 0` の比率
- `r_neg`: `E_slope_3m < 0` の比率
- `mean_3m`: `E_slope_3m` の平均
- `flips`: 符号反転回数（ゼロを無視）
- `front_mean` / `back_mean`: 前半・後半の平均
- `first3` / `last3`: 最初3つ・最後3つの値

| 値 | 判定条件 | 参照閾値 |
|----|---------|---------|
| `"Insufficient"` | `N ≤ 3` | — |
| `"Net Growth"` | `r_pos ≥ 0.7` **AND** `mean_3m > 0` **AND** `|E_slope_12| ≥ 0.4` **AND** `|E_slope_6_std_12| ≥ 0.2` | `NET_RATIO_THRESHOLD = 0.7`, `SLOPE12_THRESHOLD = 0.4`, `SLOPE6_STD12_THRESHOLD = 0.2` |
| `"Net Decline"` | `r_neg ≥ 0.7` **AND** `mean_3m < 0` **AND** `|E_slope_12| ≥ 0.4` **AND** `|E_slope_6_std_12| ≥ 0.2` | 同上 |
| `"U-Shape"` | `front_mean < 0` **AND** `back_mean > 0` **AND** `first3 の負数 ≥ 2` **AND** `last3 の正数 ≥ 2` | — |
| `"Inverted-U"` | `front_mean > 0` **AND** `back_mean < 0` **AND** `first3 の正数 ≥ 2` **AND** `last3 の負数 ≥ 2` | — |
| `"Oscillating"` | `flips ≥ 3` | — |
| `"Flat/Noisy"` | 上記いずれにも該当しない（デフォルト） | — |

**判定順序**（上から順に評価、最初にマッチしたものを返す）:
1. **Insufficient** → データ不足
2. **Net Growth / Net Decline** → 一貫した方向性（`E_slope_12` と `E_slope_6_std_12` が有効な場合のみ判定）
3. **U-Shape / Inverted-U** → 方向転換パターン
4. **Oscillating** → 振動パターン
5. **Flat/Noisy** → フォールバック

---

## 5. intervention_priority_neg / intervention_priority_pos

介入優先度スコア。負方向（`_neg`）と正方向（`_pos`）を独立に算出する。関数 `calculate_intervention_priority` にて算出。

各スコアは **加算方式** で、以下の5項目のスコアを合算する。

### 5.1 スコア構成要素

#### (1) trend_base（0–1点）

| 条件 | neg への加算 | pos への加算 |
|------|-------------|-------------|
| `trend_base == "低下中"` | +1 | — |
| `trend_base == "上昇中"` | — | +1 |

#### (2) trend_recent（0–2点）

| 条件 | neg への加算 | pos への加算 |
|------|-------------|-------------|
| `trend_recent == "急落"` | +2 | — |
| `trend_recent == "連続下降"` | +1 | — |
| `trend_recent == "急上昇"` | — | +2 |
| `trend_recent == "連続上昇"` | — | +1 |

#### (3) big_change + stability_6（0–2点）

`E_delta_1` の符号で neg/pos を振り分ける。

| 条件 | 対象スコア | 加算 |
|------|----------|------|
| `big_change == "変化大"` かつ `E_delta_1 < 0` | neg | +1 |
| `big_change == "変化大"` かつ `E_delta_1 > 0` | pos | +1 |
| `stability_6 == "不安定"` かつ `E_delta_1 < 0` | neg | +1 |
| `stability_6 == "不安定"` かつ `E_delta_1 > 0` | pos | +1 |

#### (4) E_delta_1_std（標準化差分の段階スコア、0–4点）

`E_delta_1_std_12` を優先使用。NaN の場合は `E_delta_1_std_6` にフォールバック。

`E_delta_1_std` の符号で neg/pos を振り分ける。

| |E_delta_1_std| の範囲 | 段階スコア |
|------------------------|----------|
| 0 < abs ≤ 1.0 | 0 |
| 1.0 < abs ≤ 2.0 | 1 |
| 2.0 < abs ≤ 3.0 | 2 |
| 3.0 < abs ≤ 4.0 | 3 |
| 4.0 < abs | 4 |

- `E_delta_1_std < 0` → neg に加算
- `E_delta_1_std > 0` → pos に加算

#### (5) E_slope_6_std（標準化傾きの段階スコア、0–4点）

`E_slope_6_std_12` を優先使用。NaN の場合は `E_slope_6_std_6` にフォールバック。

`E_slope_6_std` の符号で neg/pos を振り分ける。

| |E_slope_6_std| の範囲 | 段階スコア |
|------------------------|----------|
| 0 < abs ≤ 0.25 | 0 |
| 0.25 < abs ≤ 0.50 | 1 |
| 0.50 < abs ≤ 1.00 | 2 |
| 1.00 < abs ≤ 1.50 | 3 |
| 1.50 < abs | 4 |

- `E_slope_6_std < 0` → neg に加算
- `E_slope_6_std > 0` → pos に加算

#### (6) 短期・中期トレンド乖離（0–1点）

`E_slope_6`（中期6ヶ月傾き）と `E_slope_3m`（直近3ヶ月OLS傾き）の方向が乖離しているケースを検出する。

| 条件 | neg への加算 | pos への加算 | 参照閾値 |
|------|-------------|-------------|---------|
| `E_slope_6 >= 0` **AND** `E_slope_3m < -0.5` | +1 | — | `TREND_SLOPE = 0.5` |
| `E_slope_6 <= 0` **AND** `E_slope_3m > 0.5` | — | +1 | `TREND_SLOPE = 0.5` |
| いずれかが NaN、または上記に該当しない | — | — | — |

**設計意図**: `E_slope_6` は6ヶ月全体を均等に評価するため、初期に高い値があると直近の悪化が相殺される。`E_slope_3m` との乖離を検出することで、「中期は正だが直近は低下」のようなケースを neg スコアに反映できる。

### 5.2 スコア範囲

| スコア | 理論上の最小値 | 理論上の最大値 |
|--------|-------------|-------------|
| `intervention_priority_neg` | 0 | 14 |
| `intervention_priority_pos` | 0 | 14 |

**最大値の内訳**: trend_base(1) + trend_recent(2) + big_change(1) + stability_6(1) + E_delta_1_std(4) + E_slope_6_std(4) + トレンド乖離(1) = **14**

### 5.3 スコアの解釈

- **neg が高い**: 低下方向の変化が多面的に確認されている → 負の介入（支援・介入）の優先度が高い
- **pos が高い**: 上昇方向の変化が多面的に確認されている → 正の変化の観察・強化の優先度が高い
- **neg/pos ともに低い**: 安定しているか、明確な変化がない
- **neg と pos が同時に高い**: 稀だが、異なる指標が相反するシグナルを示している状態（例: 短期急上昇だが中期低下中）

---

## 付録: 処理パイプライン

`run()` 関数での処理順序:

```
1. データ読み込み・前処理        _load_and_prepare_data()
2. バリデーション・重複削除      validate_input_data()
3. 部門/セクション Z-score       add_section_group_zscores()
4. 多尺度特徴量                  add_multiscale_features()
5. 短期・中期 strength/weakness   overwrite_short_mid_personal()
6. 入力疑義フラグ                compute_flag_constant_6m()
7. トレンド判定                  apply_personal_trend_logic()
   → trend_base, trend_recent, trend_refined
8. 安定性・特性                  compute_C_columns()
   → stability_6, stability_12, trait_strength/weakness
9. level 判定                    _level_from_e()
10. 標準化差分・big_change        直接計算
11. 月次メトリクス                compute_monthly_metrics()
    → E_ma3, E_slope_3m, accel_3m
12. 傾き比率                     compute_slope_ratios()
    → r_pos, r_neg
13. エピソード・分布              compute_expanding_episode_distribution_metrics()
14. slope3m_pattern              compute_slope3m_pattern()
15. 介入優先度                   calculate_intervention_priority()
    → intervention_priority_neg, intervention_priority_pos
16. Excel 出力                   _write_excel_output()
```
