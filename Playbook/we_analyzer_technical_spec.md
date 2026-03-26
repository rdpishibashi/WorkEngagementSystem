# WE Analyzer 技術仕様書

> 対象ファイル: `we_analyzer.py`
> 最終更新: 2026-03-08

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [システムアーキテクチャ上の位置づけ](#2-システムアーキテクチャ上の位置づけ)
3. [入出力仕様](#3-入出力仕様)
4. [処理パイプライン](#4-処理パイプライン)
5. [モジュール構成](#5-モジュール構成)
6. [出力指標の説明と計算式](#6-出力指標の説明と計算式)
7. [閾値一覧](#7-閾値一覧)
8. [判定指標の詳細](#8-判定指標の詳細)
   - [level](#81-level)
   - [trend_base](#82-trend_base)
   - [trend_recent](#83-trend_recent)
   - [trend_refined](#84-trend_refined)
   - [big_change / big_change_abs](#85-big_change--big_change_abs)
   - [slope3m_pattern](#86-slope3m_pattern)
9. [intervention_priority_neg / intervention_priority_pos](#9-intervention_priority_neg--intervention_priority_pos)
10. [実行方法](#10-実行方法)

---

## 1. プロジェクト概要

`we_analyzer.py` は、ワーク・エンゲージメント（WE）の月次サーベイデータを入力として、個人ごとの多次元時系列分析を行い、トレンド判定・安定性評価・介入優先度スコアリングなどを出力するPythonスクリプトである。

Playbookプロジェクト内にあり、Adminプロジェクトが管理するEngagementMasterSSのデータを入力として使用する。同プロジェクト内には別のレガシースクリプト `we_playbook.py` も存在するが、`we_analyzer.py` はそれを全面的にリファクタリングした後継スクリプトである。

### 基本データ項目

| 項目 | 入力カラム名 | 内部カラム名 | 値域 | 説明 |
|------|-------------|------------|------|------|
| Vigor | `vigor_rating` | `vigor` | 0–18 | 活力（3項目 × 6点） |
| Dedication | `dedication_rating` | `dedication` | 0–18 | 熱意（3項目 × 6点） |
| Absorption | `absorption_rating` | `absorption` | 0–18 | 没頭（3項目 × 6点） |
| Engagement | `engagement_rating` | `engagement` | 0–54 | V + D + A の合計 |

---

## 2. システムアーキテクチャ上の位置づけ

```
Google Forms → Report (evaluate.gs) → Admin (updateMaster) → EngagementMasterSS
                                                                      │
                                                                      ├── WE-Dashboard（Streamlit可視化）
                                                                      │     └── rating2シートを読み込み
                                                                      │
                                                                      └── Playbook（we_analyzer.py）← 本スクリプト
                                                                            └── rating2シートを読み込み
                                                                                 → we_report.xlsx を出力
```

**Adminとの関係**:
- Adminの`updateMaster()`がRatingSS からEngagementMasterSSにデータを書き込む
- Adminは`calculateInterventionPriority()`で介入必要度を算出するが、本スクリプトも独自に`calculate_intervention_priority()`を持つ
- 両者のアルゴリズムは同一設計だが、本スクリプトにはフォールバック機構がある（§9参照）

**WE-Dashboardとの関係**:
- 同じ`EngagementMasterSS.xlsx`の`rating2`シートを入力データソースとして共有する
- WE-Dashboardはリアルタイム可視化、本スクリプトは包括的なバッチ分析を担当する

---

## 3. 入出力仕様

### 3.1 入力

- **ファイル**: `EngagementMasterSS.xlsx`（デフォルト）
- **シート**: `rating2`（存在しない場合は最初のシートを使用）

#### 入力カラムのマッピング

`_load_and_prepare_data()` が以下のマッピングを行う：

| 入力カラム | 内部カラム名 | 説明 |
|-----------|------------|------|
| `mail_address` | `person` | 個人識別子（優先）。存在しない場合は`name`を使用 |
| `year` + `month` | `wave` | `YYYY-MM`形式に変換 |
| `vigor_rating` | `vigor` | 活力スコア |
| `dedication_rating` | `dedication` | 熱意スコア |
| `absorption_rating` | `absorption` | 没頭スコア |
| `engagement_rating` | `engagement` | エンゲージメントスコア（存在しない場合はV+D+Aで算出） |
| `department` | `department` | 部署（Z-score算出用） |
| `section` | `section` | 課（Z-score算出用） |
| `project` | `project` | プロジェクト |

#### バリデーション

`validate_input_data()` が以下を検証する：
- 必須カラム（person, wave, vigor, dedication, absorption, engagement）の存在
- 全NaNカラムのチェック
- 負のエンゲージメントスコアの検出
- wave/person値の欠損チェック
- V/D/A の値域（0–18）チェック

重複レコードは `[person, wave]` で検出し、最新のレコードを残して削除される。

### 3.2 出力

- **ファイル**: `we_report.xlsx`（デフォルト）
- **シート1**: `monthly_trends` — 全員×全Wave の月次時系列
- **シート2**: `latest_individuals` — 最新Wave のみ（monthly_trends と同一列構成）

#### 出力カラム一覧

| カテゴリ | カラム名 |
|---------|---------|
| 識別 | `person`, `name`, `wave` |
| 判定指標 | `level`, `slope3m_pattern`, `trend_base`, `trend_recent`, `trend_refined` |
| 変化指標 | `big_change`, `big_change_abs` |
| 安定性 | `stability_6`, `stability_12` |
| 介入優先度 | `intervention_priority_neg`, `intervention_priority_pos` |
| 強み・弱み | `short_strength`, `short_weakness`, `mid_strength`, `mid_weakness` |
| 特性 | `trait_strength`, `trait_weakness` |
| 入力品質 | `flag_constant_6m` |
| 基本スコア | `engagement`, `vigor`, `dedication`, `absorption` |
| 差分・標準化差分 | `E_delta_1`, `E_delta_1_prev`, `E_delta_1_std_6`, `E_delta_1_std_12` |
| 傾き比率 | `r_pos`, `r_neg` |
| モメンタム | `E_momentum_3`, `E_momentum_6` |
| 移動平均 | `E_mean_3`, `E_mean_6` |
| 標準偏差・分散 | `E_std_6`, `E_std_12`, `E_std_18`, `E_iqr_6` |
| 傾き | `E_slope_6`, `E_slope_12`, `E_slope_6_std_6`, `E_slope_6_std_12` |
| 月次メトリクス | `E_ma3`, `E_slope_3m` |
| 分布 | `pct_high`, `pct_mid`, `pct_low` |
| エピソード | `episodes_recovery`, `episodes_fall`, `recovery_rate`, `fall_rate`, `episodes_low2plus`, `low_streak_max` |
| コンポーネント差分 | `V_delta_1`, `D_delta_1`, `A_delta_1` |
| コンポーネント傾き | `V_slope_6`, `D_slope_6`, `A_slope_6` |
| 特性確信度 | `trait_strength_conf_{V,D,A}`, `trait_weakness_conf_{V,D,A}` |

---

## 4. 処理パイプライン

`run()` 関数での処理順序：

```
1. データ読み込み・前処理        _load_and_prepare_data()
     └── Excel読み込み、カラムマッピング、wave生成

2. バリデーション・重複削除      validate_input_data()
     └── 必須カラム、値域、重複チェック

3. 部門/セクション Z-score       add_section_group_zscores()
     └── department×wave、section×wave ごとの Z-score

4. 多尺度特徴量                  add_multiscale_features()
     └── 移動平均、標準偏差、傾き、差分、モメンタム等

5. 短期・中期 strength/weakness   overwrite_short_mid_personal()
     └── 個人ベースの expanding quantile + robust Z-score

6. 入力疑義フラグ                compute_flag_constant_6m()
     └── V/D/A が6ヶ月間同一値

7. トレンド判定                  apply_personal_trend_logic()
     ├── trend_base（中期6ヶ月傾き）
     ├── trend_recent（短期1–2ヶ月差分）
     └── trend_refined（統合17カテゴリ）

8. 安定性・特性                  compute_C_columns()
     ├── _compute_stability() → stability_6, stability_12
     └── _compute_trait_strength_weakness() → trait_strength/weakness + 確信度

9. level 判定                    _level_from_e()

10. 標準化差分・big_change        run() 内で直接計算
      ├── E_delta_1_std_6 = E_delta_1 / E_std_6
      ├── E_delta_1_std_12 = E_delta_1 / E_std_12
      ├── big_change（E_std_6 ベース）
      └── big_change_abs（固定閾値6.0）

11. 月次メトリクス                compute_monthly_metrics()
      └── E_ma3, E_slope_3m, accel_3m

12. 傾き比率                     compute_slope_ratios()
      └── r_pos, r_neg（直近12ヶ月のE_slope_3m正負比率）

13. エピソード・分布              compute_expanding_episode_distribution_metrics()
      └── episodes_recovery/fall, pct_high/mid/low, low_streak_max 等

14. slope3m_pattern              compute_slope3m_pattern()
      └── Net Growth / Net Decline / U-Shape / Inverted-U / Oscillating / Flat/Noisy

15. 介入優先度                   calculate_intervention_priority()
      └── intervention_priority_neg, intervention_priority_pos

16. Excel 出力                   _write_excel_output()
      └── monthly_trends, latest_individuals の2シート
```

---

## 5. モジュール構成

### ユーティリティ関数

| 関数名 | 説明 |
|--------|------|
| `_safe_numeric(s)` | Seriesを数値型に安全に変換 |
| `_to_wave(df)` | year/month から `YYYY-MM` 形式のwaveを生成 |
| `_theil_sen_slope_window(y, max_len)` | Theil-Sen ロバスト傾き推定 |
| `_rolling_momentum(y, window)` | ローリングモメンタム |
| `_iqr_last_window(y, win)` | 直近ウィンドウのIQR |
| `_level_from_e(val)` | エンゲージメント値→5段階レベル |
| `bandify_level(x)` | レベル→3バンド（High/Mid/Low） |
| `slope3_ols(y)` | 3点のOLS回帰傾き |
| `_dynamic_level_ratio_threshold(history_len)` | 履歴長に応じた動的閾値 |
| `_select_dim_labels(counts)` | 同率トップの次元名リスト抽出 |

### 特徴量計算関数

| 関数名 | 説明 |
|--------|------|
| `validate_input_data(df)` | 入力データのバリデーション |
| `add_section_group_zscores(df, metrics)` | department/sectionごとのZ-score |
| `add_multiscale_features(df)` | 多尺度特徴量（移動平均、傾き、差分等） |
| `overwrite_short_mid_personal(use, mid_window)` | 個人ベースの短期/中期 strength/weakness |
| `compute_flag_constant_6m(df)` | 入力疑義フラグ |

### トレンド判定関数

| 関数名 | 説明 |
|--------|------|
| `apply_personal_trend_logic(df)` | trend_base, trend_recent, trend_refined を算出 |
| `_calculate_change_tag(row)` | 個人内変化の大きさ判定（`_refine_trend`内部用、**E_std_12**ベース） |
| `_is_input_suspect(row)` | 入力疑義判定 |
| `_refine_trend(row)` | 統合トレンド（trend_refined）判定 |

### 安定性・特性関数

| 関数名 | 説明 |
|--------|------|
| `compute_C_columns(df, mid_window)` | 安定性＋特性のオーケストレーター |
| `_compute_stability(df, mid_window)` | stability_6, stability_12 算出 |
| `_compute_trait_strength_weakness(df)` | trait_strength/weakness + 確信度 |

### メトリクス・パターン関数

| 関数名 | 説明 |
|--------|------|
| `compute_monthly_metrics(df)` | E_ma3, E_slope_3m, accel_3m |
| `compute_slope_ratios(df)` | r_pos, r_neg |
| `compute_expanding_episode_distribution_metrics(df)` | エピソード・分布指標 |
| `compute_slope3m_pattern(df)` | slope3m_pattern 分類 |

### 介入優先度関数

| 関数名 | 説明 |
|--------|------|
| `calculate_intervention_priority(row)` | 介入優先度スコア（neg/pos） |
| `_tiered_score(val, thresholds)` | 値を段階スコアに変換 |

### パイプライン関数

| 関数名 | 説明 |
|--------|------|
| `run(input_path, output_path, mid_window)` | メイン処理パイプライン |
| `_load_and_prepare_data(input_path)` | データ読み込み・前処理 |
| `_write_excel_output(monthly_trends, latest_individuals, output_path)` | Excel出力 |
| `main()` | CLI エントリーポイント |

---

## 6. 出力指標の説明と計算式

### 6.1 差分・変化量

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_delta_1` | `E[t] - E[t-1]` | エンゲージメントの前月差分 |
| `E_delta_1_prev` | `E[t-1] - E[t-2]` | 前々月からの差分（連続性判定用） |
| `V_delta_1` / `D_delta_1` / `A_delta_1` | `X[t] - X[t-1]` | 各次元の前月差分 |
| `E_delta_1_std_6` | `E_delta_1 / E_std_6` | 6ヶ月標準偏差で標準化した差分 |
| `E_delta_1_std_12` | `E_delta_1 / E_std_12` | 12ヶ月標準偏差で標準化した差分 |

### 6.2 移動平均

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_mean_3` | `mean(E[t-2:t])` | 直近3ヶ月移動平均 |
| `E_mean_6` | `mean(E[t-5:t])` | 直近6ヶ月移動平均 |
| `E_ma3` | `rolling(3).mean()` | 3ヶ月移動平均（monthly_metrics 用） |

### 6.3 標準偏差・分散

| 指標 | 計算式 | 必要データ数 | 説明 |
|------|--------|-------------|------|
| `E_std_6` | `std(E[t-5:t], ddof=0)` | 6ヶ月以上 | 直近6ヶ月の母標準偏差 |
| `E_std_12` | `std(E[t-11:t], ddof=0)` | 12ヶ月以上 | 直近12ヶ月の母標準偏差 |
| `E_std_18` | `std(E[t-17:t], ddof=0)` | 18ヶ月以上 | 直近18ヶ月の母標準偏差 |
| `E_iqr_6` | `Q3(E[-6:]) - Q1(E[-6:])` | — | 直近6ヶ月の四分位範囲 |

### 6.4 傾き（Slope）

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_slope_6` | Theil-Sen slope（直近6点） | 6ヶ月ロバスト傾き |
| `E_slope_12` | Theil-Sen slope（直近12点） | 12ヶ月ロバスト傾き |
| `E_slope_6_std_6` | `E_slope_6 / E_std_6` | 6ヶ月傾きを6ヶ月標準偏差で標準化 |
| `E_slope_6_std_12` | `E_slope_6 / E_std_12` | 6ヶ月傾きを12ヶ月標準偏差で標準化 |
| `V_slope_6` / `D_slope_6` / `A_slope_6` | Theil-Sen slope（直近6点） | 各次元の6ヶ月ロバスト傾き |
| `E_slope_3m` | 3点OLS回帰傾き | 直近3点の単回帰による傾き |

**Theil-Sen slope の計算方法** (`_theil_sen_slope_window`):
- データ点数 < 2: `0.0`
- データ点数 2–5: 単純傾き `(arr[-1] - arr[0]) / (n - 1)`
- データ点数 6以上: 全ペア `(arr[j] - arr[i]) / (j - i)` の中央値

### 6.5 加速度・モメンタム

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_accel_6` | `E_slope_6[t] - E_slope_6[t-1]` | 6ヶ月傾きの1期差分（加速度）※内部使用のみ |
| `E_momentum_3` | `mean(E[-3:]) - mean(E[-6:-3])` | 直近3ヶ月平均 − 前3ヶ月平均 |
| `E_momentum_6` | `mean(E[-6:]) - mean(E[-12:-6])` | 直近6ヶ月平均 − 前6ヶ月平均 |
| `accel_3m` | 3点OLS回帰傾き（`E_slope_3m` に対して） | `E_slope_3m` の加速度 ※内部使用のみ |

### 6.6 比率・分布

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `r_pos` | `count(E_slope_3m > 0) / N`（直近12ヶ月） | 正傾きの月の割合 |
| `r_neg` | `count(E_slope_3m < 0) / N`（直近12ヶ月） | 負傾きの月の割合 |
| `pct_high` | `累積 High 月数 / 累積全月数` | High バンド（Thriving+High）の累積割合 |
| `pct_mid` | `累積 Mid 月数 / 累積全月数` | Moderate バンドの累積割合 |
| `pct_low` | `累積 Low 月数 / 累積全月数` | Low バンド（Low+Critical）の累積割合 |
| `recovery_rate` | `episodes_recovery / episodes_fall` | 回復率（fall が 0 なら NaN） |
| `fall_rate` | `episodes_fall / 累積全月数` | 低下率 |

### 6.7 エピソード指標

| 指標 | 説明 |
|------|------|
| `episodes_recovery` | Low → Mid/High へ遷移した累積回数 |
| `episodes_fall` | Mid/High → Low へ遷移した累積回数 |
| `low_streak_max` | Low バンド連続月の最大記録 |
| `episodes_low2plus` | Low バンドが `LOW_EPISODE_THRESHOLD`（2）ヶ月以上続いたエピソード数 |

### 6.8 Z-score 関連

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `{V,D,A,E}_z_section` | `(val - group_mean) / group_std` | department × Wave 内での Z-score ※内部使用のみ |
| `{V,D,A,E}_z_group` | `(val - group_mean) / group_std` | section × Wave 内での Z-score ※内部使用のみ |

注：サフィックス `_z_section` は department レベルで計算され、`_z_group` は section レベルで計算される（歴史的な命名規則による）。

### 6.9 短期・中期 Strength/Weakness

| 指標 | 判定基準 | 説明 |
|------|---------|------|
| `short_strength` | 差分 ≥ max(個人P90, 2.0) かつ (robust Z が NaN または abs > 0.8) | 短期的な次元別強み（V, D, A） |
| `short_weakness` | 差分 ≤ min(個人P10, -2.0) かつ (robust Z が NaN または abs > 0.8) | 短期的な次元別弱み（V, D, A） |
| `mid_strength` | slope ≥ max(個人P90, 0.20) かつ (robust Z が NaN または abs > 0.8) | 中期的な次元別強み（V, D, A） |
| `mid_weakness` | slope ≤ min(個人P10, -0.20) かつ (robust Z が NaN または abs > 0.8) | 中期的な次元別弱み（V, D, A） |

P90/P10 は `_expanding_quantile_exclusive`（現在値を除外した累積分位数）で算出。robust Z は `_expanding_robust_z_exclusive`（MADベース）で算出。

### 6.10 特性（Trait）

| 指標 | 説明 |
|------|------|
| `trait_strength` | 直近12ヶ月で High バンド比率が動的閾値以上のとき、department内 Z > 0.5 の最頻次元 |
| `trait_weakness` | 直近12ヶ月で Low バンド比率が動的閾値以上のとき、department内 Z < -0.5 の最頻次元 |
| `trait_strength_conf_{V,D,A}` | 各次元の強み判定における確信度（当該次元の回数 / 全次元合計回数） |
| `trait_weakness_conf_{V,D,A}` | 各次元の弱み判定における確信度 |

**動的閾値** (`_dynamic_level_ratio_threshold`):
- 履歴 ≤ 6ヶ月: `0.8`
- 履歴 > 6ヶ月: `0.8` から `0.6` へ線形に緩和（減衰期間 12ヶ月）

### 6.11 安定性

| 指標 | 説明 |
|------|------|
| `stability_6` | 6ヶ月の安定性（不変 / 安定 / やや安定 / 不安定） |
| `stability_12` | 12ヶ月の安定性（完全不変 / 持続安定 / やや持続安定 / 持続不安定） |

### 6.12 入力品質フラグ

| 指標 | 条件 | 説明 |
|------|------|------|
| `flag_constant_6m` | V, D, A がすべて直近6ヶ月同一値 | 入力疑義フラグ |

---

## 7. 閾値一覧

### 7.1 傾き関連閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_SLOPE` | 0.5 | 中期傾き閾値（`trend_base`, `trend_refined` 判定） |
| `TREND_SLOPE_STD_MIN` | 0.2 | 標準化傾きの最小閾値（`trend_base` 判定） |
| `TREND_SLOPE_STD` | 0.55 | 標準化傾き閾値（全体の15%程度、`trend_base` 判定） |
| `MIN_SLOPE` | 0.20 | 個人傾きの最小閾値（`mid_strength`/`mid_weakness` 判定） |

### 7.2 変化量関連閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_DELTA_STRONG` | 5.0 | 強い変化の閾値（現在未使用） |
| `TREND_DELTA` | 1.0 | 変化閾値（現在未使用） |
| `TREND_RECENT_DELTA` | 2.0 | `trend_recent` の上昇／下降判定閾値 |
| `CHANGE_TAG_THRESHOLD` | 6.0 | 急上昇・急落の閾値（`trend_recent`, `big_change_abs`） |
| `BIG_CHANGE_PERSONAL_Z` | 2.4 | 個人内変化大の閾値（`big_change`, `_calculate_change_tag`） |

### 7.3 V/D/A 次元閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `Z_VDA_THRESHOLD` | 0.8 | robust Z-score 閾値（strength/weakness 判定） |
| `SHORT_VDA_MIN_DELTA` | 2.0 | 短期変化の最小差分閾値 |
| `SECTION_THRESHOLD` | 0.5 | department内 Z-score による特性判定閾値 |

### 7.4 レベル閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `LEVEL_THRIVING` | 43 | Thriving 判定（E > 43） |
| `LEVEL_HIGH` | 32 | High 判定（E > 32） |
| `LEVEL_LOW` | 11 | Low 判定（E < 11） |
| `LEVEL_CRITICAL` | 3 | Critical 判定（E < 3） |

### 7.5 安定性閾値（6ヶ月）

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_RANGE_EPS` | 1e-6 | E, V, D, A の6ヶ月レンジがこれ以下で「不変」 |
| `STABILITY_STD_STABLE` | 1.0 | E_std_6 がこれ未満で「安定」候補（25パーセンタイル） |
| `STABILITY_MOMENTUM_STABLE` | 0.5 | E_momentum_3 の絶対値がこれ未満で「安定」候補 |
| `STABILITY_STD_UNSTABLE` | 3.3 | E_std_6 がこれ超で「不安定」（80パーセンタイル） |

### 7.6 安定性閾値（12ヶ月）

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_STD_STABLE_LONG` | 1.5 | E_std_12 がこれ未満で「持続安定」候補 |
| `STABILITY_MOMENTUM_STABLE_LONG` | 0.8 | E_momentum_6 の絶対値がこれ未満で「持続安定」候補 |
| `STABILITY_STD_UNSTABLE_LONG` | 3.7 | E_std_12 がこれ超で「持続不安定」 |

### 7.7 履歴・エピソード関連

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `MID_MIN_RECORDS` | 2 | 中期トレンド計算に必要な最小レコード数 |
| `TRAIT_MIN_HISTORY` | 6 | 特性評価に必要な最小履歴数 |
| `LOW_EPISODE_THRESHOLD` | 2 | Low エピソード判定の連続月数閾値 |

### 7.8 特性評価

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TRAIT_WINDOW_MONTHS` | 12 | 特性評価の観測ウィンドウ |
| `TRAIT_MIN_PERIODS` | 3 | 最小期間 |
| `TRAIT_LEVEL_RATIO_MAX` | 0.8 | High/Low 比率上限（短期、履歴≤6ヶ月） |
| `TRAIT_LEVEL_RATIO_MIN` | 0.6 | High/Low 比率下限（長期、十分な履歴後） |
| `TRAIT_LEVEL_RATIO_DECAY` | 12 | 閾値を MAX → MIN に減衰させる期間 |
| `TRAIT_COUNT_EPS` | 1e-6 | 同率判定の許容誤差 |

### 7.9 slope3m_pattern 関連

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `SLOPE_PATTERN_WINDOW` | 12 | パターン判定ウィンドウ（月） |
| `NET_RATIO_THRESHOLD` | 0.7 | Net Growth/Decline の正負比率閾値 |
| `SLOPE12_THRESHOLD` | 0.4 | 12ヶ月傾きの絶対値閾値 |
| `SLOPE6_STD12_THRESHOLD` | 0.2 | 6ヶ月標準化傾きの絶対値閾値 |

---

## 8. 判定指標の詳細

### 8.1 level

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

### 8.2 trend_base

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

**注意**: trend_base は `E_slope_6_std_6`（6ヶ月標準偏差で標準化した傾き）を使用する。`E_slope_6_std_12` ではない。

**補足**: 条件B/D は標準化傾き（`E_slope_6_std_6`）が十分大きい場合、生の傾き（`E_slope_6`）の閾値チェックなしで上昇中/低下中と判定する。これにより、分散が小さい個人でも有意な傾きを検出できる。

**副作用**: trend_base が `"未評価"` の場合、以下のカラムも NaN / 空文字にリセットされる:
- 傾き系: `E_slope_6`, `E_slope_12`, `E_slope_6_std_6`, `E_slope_6_std_12`, `E_accel_6`, `V_slope_6`, `D_slope_6`, `A_slope_6`
- 強み・弱み: `mid_strength`, `mid_weakness`

---

### 8.3 trend_recent

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

### 8.4 trend_refined

`trend_base` と `trend_recent` を統合した17カテゴリーの詳細トレンド判定。関数 `_refine_trend` にて算出。

**内部参照値**:
- `change_tag`: `_calculate_change_tag()` で判定 → `"変化大"` or `"not 変化大"`
  - 条件: `E_std_12 > 0` **AND** `|E_delta_1| / E_std_12 > BIG_CHANGE_PERSONAL_Z (2.4)` のとき `"変化大"`
  - **注意**: この内部判定は **E_std_12** を使用する（出力カラム`big_change`の E_std_6 とは異なる）
- `E_slope_6`: 6ヶ月ロバスト傾き
- `E_delta_1`: 前月差分
- `flag_constant_6m`: 入力疑義フラグ

| 優先度 | 値 | trend_recent | trend_base | change_tag | その他条件 |
|--------|-----|-------------|-----------|-----------|-----------|
| 0 | `"入力疑義"` | — | — | — | `flag_constant_6m == TRUE` |
| 1 | `"上昇加速"` | 上昇/急上昇/連続上昇 | 上昇中 | 変化大 | `\|E_slope_6\| > 0.5` |
| 1 | `"低下加速"` | 下降/急落/連続下降 | 低下中 | 変化大 | `\|E_slope_6\| > 0.5` |
| 2 | `"上昇継続"` | 上昇/急上昇/連続上昇/横ばい | 上昇中 | not 変化大 | `\|E_slope_6\| > 0.5` **AND** `E_delta_1 ≥ 0` |
| 2 | `"低下継続"` | 下降/急落/連続下降/横ばい | 低下中 | not 変化大 | `\|E_slope_6\| > 0.5` **AND** `E_delta_1 ≤ 0` |
| 3 | `"復活"` | 上昇/急上昇 | 低下中 | 変化大 | `\|E_slope_6\| > 0.5` |
| 3 | `"悪化"` | 下降/急落 | 上昇中 | 変化大 | `\|E_slope_6\| > 0.5` |
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
- `BIG_CHANGE_PERSONAL_Z = 2.4`（`change_tag` 判定内部）
- `E_std_12` > 0（`change_tag` 判定内部）

**設計上の注意**:
- 優先度1–3の `|E_slope_6| > TREND_SLOPE` チェックは冗長に見えるが、`trend_base` が条件B/D（標準化傾きのみ）で判定された場合、生の傾きが小さい可能性があるため必要。
- 優先度4（回復/低下危機）には `|E_slope_6|` チェックがない。これにより、傾きが小さくても最近の急変で判定される。
- 優先度5–6には `|E_delta_1|` の閾値チェックがない。trend_recent の条件（閾値2.0超）または E_delta_1 の符号のみで判定する。

---

### 8.5 big_change / big_change_abs

#### big_change（出力カラム）

個人の過去の変動幅に対する相対的な変化の大きさを判定する。`run()` 関数内で算出。**E_std_6** ベース。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"変化大"` | `E_std_6 > 0` **AND** `\|E_delta_1\| / E_std_6 > 2.4` | `BIG_CHANGE_PERSONAL_Z = 2.4` |
| `""` | 上記に該当しない | — |

#### _calculate_change_tag（_refine_trend 内部用）

trend_refined の判定で使用される内部関数。**E_std_12** ベース。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"変化大"` | `E_std_12 > 0` **AND** `\|E_delta_1\| / E_std_12 > 2.4` | `BIG_CHANGE_PERSONAL_Z = 2.4` |
| `"not 変化大"` | 上記に該当しない | — |

**両者の違い**:
- `big_change`（出力カラム）: **E_std_6** を使用。直近6ヶ月の変動に対する相対評価。結果は `""` または `"変化大"`。
- `_calculate_change_tag`（内部判定）: **E_std_12** を使用。直近12ヶ月の変動に対する相対評価。結果は `"not 変化大"` または `"変化大"`。

**比較演算子**: 両方とも `>`（より大きい）を使用。`>=`（以上）ではない。

#### big_change_abs

エンゲージメント差分の絶対値に基づく、個人間で共通の固定閾値での変化判定。`run()` 関数内で算出。

| 値 | 条件 | 参照閾値 |
|----|------|---------|
| `"変化大"` | `\|E_delta_1\| ≥ 6.0` | `CHANGE_TAG_THRESHOLD = 6.0` |
| `""` | `\|E_delta_1\| < 6.0` | — |

---

### 8.6 slope3m_pattern

直近12ヶ月の `E_slope_3m`（3ヶ月OLS傾き）の時系列パターンを分類する。関数 `compute_slope3m_pattern` にて算出。

**注意**: このパターンは個人ごとに1つの値（最新Waveの値）のみ算出される。

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
| `"Net Growth"` | `r_pos ≥ 0.7` **AND** `mean_3m > 0` **AND** `\|E_slope_12\| ≥ 0.4` **AND** `\|E_slope_6_std_12\| ≥ 0.2` | `NET_RATIO_THRESHOLD = 0.7`, `SLOPE12_THRESHOLD = 0.4`, `SLOPE6_STD12_THRESHOLD = 0.2` |
| `"Net Decline"` | `r_neg ≥ 0.7` **AND** `mean_3m < 0` **AND** `\|E_slope_12\| ≥ 0.4` **AND** `\|E_slope_6_std_12\| ≥ 0.2` | 同上 |
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

## 9. intervention_priority_neg / intervention_priority_pos

介入優先度スコア。負方向（`_neg`）と正方向（`_pos`）を独立に算出する。関数 `calculate_intervention_priority` にて算出。

各スコアは **加算方式** で、以下の6項目のスコアを合算する。

### 9.1 スコア構成要素

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

#### (3) big_change（0–1点）

`E_delta_1` の符号で neg/pos を振り分ける。

| 条件 | 対象スコア | 加算 |
|------|----------|------|
| `big_change == "変化大"` かつ `E_delta_1 < 0` | neg | +1 |
| `big_change == "変化大"` かつ `E_delta_1 > 0` | pos | +1 |

#### (4) stability_6（0–1点）

`E_delta_1` の符号で neg/pos を振り分ける。

| 条件 | 対象スコア | 加算 |
|------|----------|------|
| `stability_6 == "不安定"` かつ `E_delta_1 < 0` | neg | +1 |
| `stability_6 == "不安定"` かつ `E_delta_1 > 0` | pos | +1 |

#### (5) E_delta_1_std（標準化差分の段階スコア、0–4点）

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

#### (6) E_slope_6_std（標準化傾きの段階スコア、0–4点）

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

#### (7) 短期・中期トレンド乖離（0–1点）

`E_slope_6`（中期6ヶ月傾き）と `E_slope_3m`（直近3ヶ月OLS傾き）の方向が乖離しているケースを検出する。

| 条件 | neg への加算 | pos への加算 | 参照閾値 |
|------|-------------|-------------|---------|
| `E_slope_6 >= 0` **AND** `E_slope_3m < -0.5` | +1 | — | `TREND_SLOPE = 0.5` |
| `E_slope_6 <= 0` **AND** `E_slope_3m > 0.5` | — | +1 | `TREND_SLOPE = 0.5` |
| いずれかが NaN、または上記に該当しない | — | — | — |

**設計意図**: `E_slope_6` は6ヶ月全体を均等に評価するため、初期に高い値があると直近の悪化が相殺される。`E_slope_3m` との乖離を検出することで、「中期は正だが直近は低下」のようなケースを neg スコアに反映できる。

### 9.2 スコア範囲

| スコア | 理論上の最小値 | 理論上の最大値 |
|--------|-------------|-------------|
| `intervention_priority_neg` | 0 | 14 |
| `intervention_priority_pos` | 0 | 14 |

**最大値の内訳**: trend_base(1) + trend_recent(2) + big_change(1) + stability_6(1) + E_delta_1_std(4) + E_slope_6_std(4) + トレンド乖離(1) = **14**

### 9.3 Adminプロジェクトとの比較

Adminプロジェクト (`engagement_management.gs`) の `calculateInterventionPriority()` は同一設計の7要素スコアリングを持つが、以下の点で異なる：

| 項目 | we_analyzer.py | Admin |
|------|---------------|-------|
| E_delta_1_std のフォールバック | `_std_12` → `_std_6` | `_std_12` のみ（フォールバックなし） |
| E_slope_6_std のフォールバック | `_std_12` → `_std_6` | `_std_12` のみ（フォールバックなし） |
| 最大スコア | 14 | 13（フォールバックなしのため実質差なし） |

### 9.4 スコアの解釈

- **neg が高い**: 低下方向の変化が多面的に確認されている → 負の介入（支援・介入）の優先度が高い
- **pos が高い**: 上昇方向の変化が多面的に確認されている → 正の変化の観察・強化の優先度が高い
- **neg/pos ともに低い**: 安定しているか、明確な変化がない
- **neg と pos が同時に高い**: 稀だが、異なる指標が相反するシグナルを示している状態（例: 短期急上昇だが中期低下中）

---

## 10. 実行方法

### コマンドライン

```bash
python we_analyzer.py [--input INPUT] [--output OUTPUT] [--mid-window MID_WINDOW]
```

| 引数 | デフォルト | 説明 |
|------|----------|------|
| `--input`, `-i` | `EngagementMasterSS.xlsx` | 入力ファイルパス |
| `--output`, `-o` | `we_report.xlsx` | 出力ファイルパス |
| `--mid-window` | `6` | 中期ウィンドウサイズ（月） |

### ファイル検索順序

入力ファイルが見つからない場合、以下の順で検索する：
1. 指定されたパス（そのまま）
2. `../SpreadSheet/` ディレクトリ（Playbookからの相対パス）
3. `/mnt/data/` ディレクトリ（クラウド環境用）

### 依存ライブラリ

- `numpy`
- `pandas`
- `xlsxwriter`（オプション — Excelフォーマット設定用。なくても動作する）
