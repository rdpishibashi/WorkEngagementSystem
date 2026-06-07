# we_analyzer.py 技術文書

> 対象ファイル: `we_analyzer.py`  
> 最終更新: 2026-06-07（介入優先度の改善、Admin と完全同期：①trend_base の下降反転振替＝`trend_base="上昇中"` でも `trend_recent ∈ {下降, 急落, 連続下降}` なら pos +1 を neg +1 に振替。②trend_refined="低下継続" に neg +1（持続的低下の高止まり、neg のみ）。③直近変化の加点を生 E_delta_1 から trend_recent カテゴリへ一本化（急=連続±3/上昇下降±2/横ばい0、重複解消＋直近重視）。④E_delta_1_std の段階スコアを廃止（trend_recent と同一ソースの重複）。⑤volatility_6_p90 波動あり を neg +2→+1。⑥flag_constant_6m を 4/3/2/2→3/2/1/1 に引下げ（調査抵抗者が毎月候補化するのを抑制）。⑦介入優先度の要素別内訳カラム `intv_*`（符号付き）を出力に追加＝`intervention_priority_pos`〜`level` 間。`intervention_priority_breakdown()` を単一ソース化し neg/pos を内訳から導出）  
> 2026-06-03（出力列順の整理：intervention_priority_neg/pos を wave–level 間へ、E_std_6/12/18 と E_std_6 個人内閾値を stability_6–stability_12 間へ、direction_6/volatility_6 系列を E_std_6 閾値直後へ移動。あわせて閾値列 E_std_6_p90/p75 を E_std_6_threshold_p90/p75 へリネーム）  
> 2026-06-02（stability_6 を個人内基準（E_std_6_threshold_p90/p75）に変更・「やや不安定」追加、direction_6「横ばい」→「方向変化なし」、E_std_6 個人内閾値列を出力追加）  
> 本文書は `we_analyzer_technical_spec.md` と `we_analyzer_technical_documentation.md` を統合・整理した版である。

---

## 目次

1. [目的と概要](#1-目的と概要)
2. [システムアーキテクチャ上の位置づけ](#2-システムアーキテクチャ上の位置づけ)
3. [入出力仕様](#3-入出力仕様)
4. [処理パイプライン](#4-処理パイプライン)
5. [モジュール構成](#5-モジュール構成)
6. [共通ユーティリティ関数](#6-共通ユーティリティ関数)
7. [出力指標辞典](#7-出力指標辞典)
   - [7.1 識別・基本列](#71-識別基本列)
   - [7.2 レベル・パターン・統合ラベル](#72-レベルパターン統合ラベル)
   - [7.3 変化イベント群](#73-変化イベント群)
   - [7.4 安定性群](#74-安定性群)
   - [7.5 介入優先度群](#75-介入優先度群)
   - [7.6 短期・中期 V/D/A 強み・弱み群](#76-短期中期-vda-強み弱み群)
   - [7.7 特性群](#77-特性群)
   - [7.8 入力品質フラグ](#78-入力品質フラグ)
   - [7.9 差分・比率・モメンタム・移動統計群](#79-差分比率モメンタム移動統計群)
   - [7.10 傾き・加速度群](#710-傾き加速度群)
   - [7.11 分布・エピソード群](#711-分布エピソード群)
   - [7.12 個人内変動指標群](#712-個人内変動指標群direction_6--volatility_6)
8. [閾値一覧](#8-閾値一覧)
9. [判定指標の詳細](#9-判定指標の詳細)
   - [9.1 level](#91-level)
   - [9.2 trend_base](#92-trend_base)
   - [9.3 trend_recent](#93-trend_recent)
   - [9.4 trend_refined](#94-trend_refined)
   - [9.5 big_change / big_change_abs](#95-big_change--big_change_abs)
   - [9.6 slope3m_pattern](#96-slope3m_pattern)
10. [介入優先度スコア詳細](#10-介入優先度スコア詳細)
11. [出力に含まれない内部計算列](#11-出力に含まれない内部計算列)
12. [実装上の注意点・仕様上の癖](#12-実装上の注意点仕様上の癖)
13. [変更時の影響範囲](#13-変更時の影響範囲)
14. [保守観点での改善候補](#14-保守観点での改善候補)
15. [実行方法](#15-実行方法)

---

## 1. 目的と概要

`we_analyzer.py` は、ワーク・エンゲージメント（WE）の月次サーベイデータを入力として、個人ごとの多次元時系列分析を行い、トレンド判定・安定性評価・介入優先度スコアリングなどを出力するPythonスクリプトである。

本文書は `we_analyzer.py` を拡張・保守するための技術資料であり、**出力される各指標の算出方法・判定ロジックをコードを読まなくても確認できる**ことを目的とする。

対象は次の5点。

1. 入出力仕様
2. 実行フロー
3. 各指標の算出方法・判定ロジック
4. 実装上の注意点と設計上の癖
5. 保守時の変更ポイントと影響範囲

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
- 両者のアルゴリズムは同一設計だが、本スクリプトにはフォールバック機構がある（§10参照）

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

| 内部列 | 意味 | 取得元 |
|--------|------|--------|
| `person` | 個人識別子 | `mail_address` 優先、なければ `name` |
| `name` | 氏名 | 元データの `name` |
| `wave` | 月次キー (`YYYY-MM`) | `year/month` または `date` から生成 |
| `vigor` | 活力 | `vigor_rating` または `vigor` |
| `dedication` | 熱意 | `dedication_rating` または `dedication` |
| `absorption` | 没頭 | `absorption_rating` または `absorption` |
| `engagement` | 合計エンゲージメント | `engagement_rating`、なければ V+D+A の合計 |
| `department` | 部門 | `department`、なければ `section` |
| `section` | セクション | `section`、なければ `group` |
| `project` | プロジェクト | `project`、なければ `project_group` |

**wave の生成** (`_to_wave()`):
- `year` と `month` があれば `YYYY-MM`
- それがなければ `date` を datetime 変換して `YYYY-MM`
- どちらもなければ例外

#### バリデーション

`validate_input_data()` が以下を検証する（**停止はしない**。エラー表示後も処理継続）：

- 必須カラム（person, wave, vigor, dedication, absorption, engagement）の存在
- V/D/A が全て NaN のカラム
- 負のエンゲージメントスコア
- wave / person 値の欠損
- V/D/A の値域（0–18）外の値

重複レコードは `[person, wave]` で検出し、`keep='last'` で最後のレコードを残して削除される。

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
| 個人内変動 | `direction_6_p90/p75`, `direction_6_latest`, `direction_6_threshold_p90/p75`, `volatility_6_p90/p75`, `residual_sd_6_latest`, `volatility_6_threshold_p90/p75`, `sign_change_count_6` |
| 強み・弱み | `short_strength`, `short_weakness`, `mid_strength`, `mid_weakness` |
| 特性 | `trait_strength`, `trait_weakness` |
| 入力品質 | `flag_constant_6m` |
| 基本スコア | `engagement`, `vigor`, `dedication`, `absorption` |
| 差分・標準化差分 | `E_delta_1`, `E_delta_1_prev`, `E_delta_1_std_6`, `E_delta_1_std_12` |
| 傾き比率 | `r_pos`, `r_neg` |
| モメンタム | `E_momentum_3`, `E_momentum_6` |
| 移動平均 | `E_mean_3`, `E_mean_6` |
| 標準偏差・分散 | `E_std_6`, `E_std_12`, `E_std_18`, `E_std_6_threshold_p90`, `E_std_6_threshold_p75`, `E_iqr_6` |
| 傾き | `E_slope_6`, `E_slope_12`, `E_slope_6_std_6`, `E_slope_6_std_12` |
| 月次メトリクス | `E_ma3`, `E_slope_3m` |
| 個人内変動 | `direction_6_p90/p75`, `direction_6_latest`, `direction_6_threshold_p90/p75`, `volatility_6_p90/p75`, `residual_sd_6_latest`, `volatility_6_threshold_p90/p75`, `sign_change_count_6` |
| 分布 | `pct_high`, `pct_mid`, `pct_low` |
| エピソード | `episodes_recovery`, `episodes_fall`, `recovery_rate`, `fall_rate`, `episodes_low2plus`, `low_streak_max` |
| コンポーネント差分 | `V_delta_1`, `D_delta_1`, `A_delta_1` |
| コンポーネント傾き | `V_slope_6`, `D_slope_6`, `A_slope_6` |
| 特性確信度 | `trait_strength_conf_{V,D,A}`, `trait_weakness_conf_{V,D,A}` |

---

## 4. 処理パイプライン

`run()` 関数での処理順序。**この順序は仕様に近く、安易に入れ替えない**。特に `trend_refined`、`stability_*`、`trait_*`、`intervention_priority_*` は前段の特徴量に依存する。`E_slope_3m` は `apply_personal_trend_logic()` の `trend_base` フォールバック判定（6ヶ月未満履歴）で参照するため、step 5 で先行計算する必要がある。

```
1.  _load_and_prepare_data()
      └── Excel読み込み、カラムマッピング、wave生成

2.  validate_input_data()
      └── 必須カラム、値域、重複チェック

3.  person-wave 重複削除（重複時は最後のレコードを採用）

4.  add_section_group_zscores()
      └── department×wave、section×wave ごとの Z-score

5.  add_multiscale_features()
      └── 移動平均、標準偏差、傾き、差分、モメンタム、E_slope_3m 等

6.  overwrite_short_mid_personal()
      └── 個人ベースの expanding quantile + robust Z-score

7.  compute_flag_constant_6m()
      └── V/D/A が3ヶ月間同一値

8.  apply_personal_trend_logic()
      ├── trend_base（中期6ヶ月傾き、E_slope_3m フォールバックを使用）
      ├── trend_recent（短期1–2ヶ月差分）
      └── trend_refined（統合17カテゴリ）

9a. add_personal_stability_thresholds()
      └── E_std_6_threshold_p90, E_std_6_threshold_p75（個人内 expanding P90/P75 閾値）

9b. compute_C_columns()
      ├── _compute_stability() → stability_6（個人内閾値使用）, stability_12
      └── _compute_trait_strength_weakness() → trait_strength/weakness + 確信度

10. level 計算 (_level_from_e)

11. E_delta_1_std_6 / E_delta_1_std_12 を計算

12. big_change / big_change_abs を計算

13. compute_monthly_metrics()
      └── E_ma3, accel_3m のみ（E_slope_3m は step 5 で算出済み）

14. compute_slope_ratios()
      └── r_pos, r_neg（直近12ヶ月のE_slope_3m正負比率）

15. compute_expanding_episode_distribution_metrics()
      └── episodes_recovery/fall, pct_high/mid/low, low_streak_max 等

16. compute_slope3m_pattern()
      └── Net Growth / Net Decline / U-Shape / Inverted-U / Oscillating / Flat/Noisy

17. calculate_intervention_priority()
      └── intervention_priority_neg, intervention_priority_pos

18. flag_constant_6m の加点を intervention_priority_neg に反映

19. add_personal_variability_features()
      └── direction_6_* / volatility_6_* 系列（trend_* とは独立、個人内分位点ベース）

20. monthly_trends / latest_individuals を構成

21. _write_excel_output()
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
| `_calculate_change_tag(row)` | 個人内変化の大きさ・方向判定（`_refine_trend`内部用、**E_std_6**ベース） |
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
| `intervention_priority_breakdown(row)` | 介入優先度の要素別**符号付き内訳**（`intv_*`、単一ソース）。§7.5 参照 |
| `calculate_intervention_priority(row)` | 介入優先度スコア（neg/pos）。内訳から集約 |
| `_tiered_score(val, thresholds)` | 値を段階スコアに変換 |

### 個人内変動指標関数

| 関数名 | 説明 |
|--------|------|
| `add_personal_variability_features(df)` | direction_6_* / volatility_6_* 系列を算出（trend_* と独立、個人内分位点ベース） |
| `_ols_residual_sd(y)` | OLS フィット時の残差標準偏差（volatility の R6） |

### パイプライン関数

| 関数名 | 説明 |
|--------|------|
| `run(input_path, output_path, mid_window)` | メイン処理パイプライン |
| `_load_and_prepare_data(input_path)` | データ読み込み・前処理 |
| `_write_excel_output(monthly_trends, latest_individuals, output_path)` | Excel出力 |
| `main()` | CLI エントリーポイント |

---

## 6. 共通ユーティリティ関数

### 6.1 レベル分類 `_level_from_e()`

`engagement >= 43` → `Thriving`（先に43との比較）、`engagement <= 3` → `Critical`、`engagement >= 32` → `High`、`engagement <= 11` → `Low`、それ以外 → `Moderate`。評価順序は「43超・3未満・32超・11未満・それ以外」の順であることに注意。

### 6.2 バンド化 `bandify_level()`

| level | バンド |
|-------|--------|
| `Thriving`, `High` | `High` |
| `Moderate` | `Mid` |
| `Low`, `Critical` | `Low` |
| NaN | `Unknown` |

この3バンドは `pct_high`, `pct_mid`, `pct_low`, `episodes_*`, `trait_*` の基礎になる。

### 6.3 ロバスト傾き `_theil_sen_slope_window(y, max_len)`

入力系列の末尾 `max_len` 点以内で傾きを計算する。名前は Theil-Sen だが、少数点では単純傾きを返す。

| データ点数 | 計算方法 |
|-----------|---------|
| 0〜1点 | `0.0` |
| 2〜5点 | 単純傾き `(last - first) / (n - 1)` |
| 6点以上 | 全点対 `(arr[j] - arr[i]) / (j - i)` の中央値（真のTheil-Sen） |

### 6.4 3点 OLS 傾き `slope3_ols(y)`

`x = [0, 1, 2]` に対する単回帰の傾き。

$$\text{slope} = \frac{\sum (x - \bar{x})(y - \bar{y})}{\sum (x - \bar{x})^2}$$

`E_slope_3m` と `accel_3m` に使う。

### 6.5 モメンタム `_rolling_momentum(y, window)`

$$\text{momentum} = \text{直近window点平均} - \text{その直前window点平均}$$

例: `window=3` なら「直近3ヶ月平均 − その前3ヶ月平均」。前半窓が足りない場合は、残っている履歴平均で代替。

### 6.6 直近窓 IQR `_iqr_last_window(y, win)`

直近 `win` 点以内について $IQR = Q_{75} - Q_{25}$ を計算する。

---

## 7. 出力指標辞典

### 7.1 識別・基本列

| カラム | 説明 |
|--------|------|
| `person` | 個人識別子。`mail_address` があればそれを使い、なければ `name` |
| `name` | 入力の `name` 列をそのまま保持 |
| `wave` | 月次キー。`YYYY-MM` 形式 |
| `engagement` | `engagement_rating` があればそれを数値化。なければ `vigor + dedication + absorption`（3項目すべて揃っているときのみ） |
| `vigor` / `dedication` / `absorption` | 対応する rating 列または同名列を数値化して使用 |

---

### 7.2 レベル・パターン・統合ラベル

#### `level`

§9.1 の `_level_from_e()` による5区分。

#### `slope3m_pattern`

個人ごとに1つだけ算出され、当人の全行に同じ値が付与される（波ごとの可変判定ではない）。詳細は§9.6参照。

#### `trend_base`

中期トレンド。カテゴリは `上昇中`, `低下中`, `安定`, `未評価`。詳細は§9.2参照。

#### `trend_recent`

短期トレンド。カテゴリは `急上昇`, `上昇`, `横ばい`, `下降`, `急落`, `連続上昇`, `連続下降`。詳細は§9.3参照。

#### `trend_refined`

最終統合ラベル。17カテゴリ。詳細は§9.4参照。

---

### 7.3 変化イベント群

#### `big_change`

個人内標準偏差（E_std_6）に対する相対的な変化の大きさと方向。

$$|E\_delta\_1| / E\_std\_6 \geq 2.4 \quad (\text{かつ } E\_std\_6 > 0)$$

| 値 | 条件 |
|----|------|
| `"増加変化大"` | 上記を満たし `E_delta_1 > 0` |
| `"減少変化大"` | 上記を満たし `E_delta_1 < 0` |
| `""` | 上記に該当しない（または E_std_6 が 0 以下） |

#### `big_change_abs`

絶対変化量による固定閾値での補助タグ（個人間比較可能）。

| 値 | 条件 |
|----|------|
| `"変化大"` | $|E\_delta\_1| \geq 6.0$ |
| `""` | $|E\_delta\_1| < 6.0$ |

**`big_change` と `big_change_abs` の違い**:
- `big_change`: 個人内標準偏差基準。その人自身の変動幅に対する相対評価。両者が矛盾することはある。
- `big_change_abs`: 生の絶対差分基準。個人間で統一された基準。

---

### 7.4 安定性群

#### `stability_6`

6ヶ月安定性。**個人内基準**（その人自身の過去 E_std_6 の P90/P75 を閾値とする完全個人内比較）。
カテゴリは `不変`, `不安定`, `やや不安定`, `安定`, `判定保留`。履歴数が2以下なら空文字。

閾値は `E_std_6_threshold_p90` / `E_std_6_threshold_p75`（`add_personal_stability_thresholds()` で算出）。
過去有効 E_std_6 数 < `STD6_MIN_PAST_WINDOWS`(=5) の場合、閾値が NaN になるため `判定保留`。

| 優先 | 値 | 条件 |
|------|-----|------|
| 1 | `不変` | E/V/D/A の6ヶ月 range がすべて ≤ `STABILITY_RANGE_EPS`(1e-6) |
| 2 | `不安定` | `E_std_6 > E_std_6_threshold_p90`（個人内 P90 超え）|
| 3 | `やや不安定` | `E_std_6 > E_std_6_threshold_p75`（個人内 P75 超え）|
| 4 | `安定` | 閾値あり かつ `E_std_6 ≤ E_std_6_threshold_p75` |
| default | `判定保留` | E_std_6_threshold_p90 が NaN（過去母数不足）または E_std_6 が NaN |

#### `E_std_6_threshold_p90` / `E_std_6_threshold_p75`

`stability_6` の個人内判定閾値。各 wave t における過去（t 未満）の有効 E_std_6 の P90 / P75。
`add_personal_stability_thresholds()` が expanding 方式で算出。過去有効 E_std_6 数 < `STD6_MIN_PAST_WINDOWS`(=5) なら NaN。

#### `stability_12`

12ヶ月安定性。カテゴリは `完全不変`, `持続安定`, `やや持続安定`, `持続不安定`。履歴数が12以下なら空文字。

| 優先 | 値 | 条件 |
|------|-----|------|
| 1 | `完全不変` | E/V/D/A の12ヶ月 range がすべて ≤ 1e-6 |
| 2 | `持続安定` | `E_std_12 <= 1.5` かつ `|E_momentum_6| <= 0.8` |
| 3 | `持続不安定` | `E_std_12 >= 3.7` |
| 4 | `やや持続安定` | 上記いずれにも該当しない |

---

### 7.5 介入優先度群

#### `intervention_priority_neg` / `intervention_priority_pos`

`calculate_intervention_priority(row)` が負方向・正方向を別々に加点する。詳細は§10参照。

#### 要素別内訳カラム `intv_*`（符号付き）

介入優先度に加算された各要素の点数を確認できるよう、出力（`monthly_trends` / `latest_individuals`）の `intervention_priority_pos` と `level` の間に以下の内訳カラムを出力する。指標名と区別するため `intv_` prefix を付ける。**符号付き**（正=pos 寄与, 負=neg 寄与）で、`intv_*` の正の和＝pos、負の和の絶対値＝neg を復元できる（`intv_flag_constant` 含む）。

| カラム | 加算要素 | 取りうる値 |
|--------|----------|-----------|
| `intv_trend_base` | trend_base（下降反転は neg に振替） | -1 / 0 / +1 |
| `intv_trend_refined` | trend_refined=="低下継続" | -1 / 0 |
| `intv_trend_recent` | trend_recent 直近トレンド | -3〜+3 |
| `intv_big_change` | big_change | -1 / 0 / +1 |
| `intv_stab-volat` | stability_6 / volatility_6_p90（neg のみ合算） | -2 / -1 / 0 |
| `intv_E_slope_std` | E_slope_6_std 段階スコア | -4〜+4 |
| `intv_E_slope_3m` | E_slope_3m 直近3ヶ月トレンド | -1 / 0 / +1 |
| `intv_flag_constant` | flag_constant_6m 加点（neg のみ） | -3 / -2 / -1 / 0 |

内訳は `intervention_priority_breakdown(row)` を単一ソースとして算出し、`calculate_intervention_priority()` はこの内訳から neg/pos を導出する（`intv_flag_constant` のみ §10(8) と同じく `run()` で別途付与）。各加算要素の意味・重みは§10参照。

---

### 7.6 短期・中期 V/D/A 強み・弱み群

#### `short_strength` / `short_weakness`

各人・各次元（V/D/A）について1ヶ月差分 `*_delta_1` を使い、**その人自身の過去履歴を基準**に異常に大きい変化を検出する。

各次元ごとに以下を計算（現在値を除外した expanding 統計）:
- expanding 90 パーセンタイル `p90`
- expanding 10 パーセンタイル `p10`
- expanding robust Z-score（中央値と MAD ベース）

| 判定しきい値 | 式 |
|-------------|-----|
| 正方向 | $th_{pos} = \max(p90, 2.0)$ |
| 負方向 | $th_{neg} = \min(p10, -2.0)$ |

| 指標 | 条件 |
|------|------|
| `short_strength` に次元追加 | `delta_1 >= th_pos` かつ (`robust_z` が NaN または `|robust_z| > 0.8`) |
| `short_weakness` に次元追加 | `delta_1 <= th_neg` かつ (`robust_z` が NaN または `|robust_z| > 0.8`) |

該当次元を `V`, `D`, `A` としてカンマ連結。例: `V, D`

#### `mid_strength` / `mid_weakness`

短期版と同じ考え方だが、対象は6ヶ月 rolling slope（`*_slope_6`、関数引数 `mid_window` に依存）。

| 判定しきい値 | 式 |
|-------------|-----|
| 正方向 | $th_{pos\_s} = \max(p90\_s, 0.2)$ |
| 負方向 | $th_{neg\_s} = \min(p10\_s, -0.2)$ |

履歴数が2以下の人は、後段 `apply_personal_trend_logic()` で空文字に上書きされる。

---

### 7.7 特性群

#### `trait_strength` / `trait_weakness`

過去12ヶ月窓での**持続的な高位/低位傾向**と**V/D/Aの部門内相対強弱**を組み合わせて判定する。V/D/Aの強み・弱みは生スコアではなく `*_z_section`（department × wave 内 Z-score）を使うため、組織構成や部門平均との差の影響を受ける。

**発火条件**:
- 履歴数 `>= 6`
- 高位比率または低位比率が動的閾値以上

**動的閾値** `_dynamic_level_ratio_threshold(history_len)`:
- 履歴6ヶ月時点: 0.8
- その後、履歴が長いほど線形に緩和、最低 0.6 まで（緩和期間12ヶ月）

`trait_strength`:
- `pct_high >= 動的閾値`
- その12ヶ月窓で `vigor_z_section > 0.5`, `dedication_z_section > 0.5`, `absorption_z_section > 0.5` の回数を各次元で数える
- 最大回数の次元ラベルを返す（同率トップは複数返す）

`trait_weakness`:
- `pct_low >= 動的閾値`
- 同様に各 `*_z_section < -0.5` の回数を数える

#### `trait_strength_conf_V/D/A` / `trait_weakness_conf_V/D/A`

`trait_strength`/`trait_weakness` が成立した時の各次元の確信度。

$$conf\_V = \frac{V\text{ の strength カウント}}{V + D + A の strength カウント合計}$$

---

### 7.8 入力品質フラグ

#### `flag_constant_6m`

各人について、**V/D/A の3値がすべて等しい（v == d == a）状態が3ヶ月連続**したときにカテゴリ文字列を付与する。該当しない月は空文字 `""`。

| 優先 | 値 | 条件 |
|------|-----|------|
| 1 | `FIX_SHIFTED` | 3ヶ月連続 v==d==a かつ、以前の固定値から値が変化してちょうど3ヶ月目 |
| 2 | `LOW_FIXED` | 3ヶ月連続 v==d==a かつ level が `Critical` または `Low` |
| 3 | `MID_EVASION` | 3ヶ月連続 v==d==a かつ level が `Moderate` |
| 4 | `HIGH_AVOIDANCE` | 3ヶ月連続 v==d==a かつ level が `High` または `Thriving` |
| — | `""` | 上記いずれにも該当しない |

`trend_refined` では `flag_constant_6m != ""` のとき最優先で `入力疑義` を返す。  
`intervention_priority_neg` には加点マップが適用される（§10参照）。

---

### 7.9 差分・比率・モメンタム・移動統計群

| 指標 | 計算式 | 備考 |
|------|--------|------|
| `E_delta_1` | $E(t) - E(t-1)$ | 初回行は `0.0` |
| `E_delta_1_prev` | $E(t-1) - E(t-2)$ | 3点未満では `0.0` |
| `E_delta_1_std_6` | $E\_delta\_1 / E\_std\_6$ | `E_std_6 > 0` のときのみ |
| `E_delta_1_std_12` | $E\_delta\_1 / E\_std\_12$ | `E_std_12 > 0` のときのみ |
| `V_delta_1` / `D_delta_1` / `A_delta_1` | $X(t) - X(t-1)$ | 各次元の前月差分、初回 `0.0` |
| `r_pos` | $\#(E\_slope\_3m > 0) / \#(\text{有効})$ | 直近12ヶ月以内の正傾き比率 |
| `r_neg` | $\#(E\_slope\_3m < 0) / \#(\text{有効})$ | 直近12ヶ月以内の負傾き比率 |
| `E_momentum_3` | 直近3ヶ月平均 − その前3ヶ月平均 | |
| `E_momentum_6` | 直近6ヶ月平均 − その前6ヶ月平均 | |
| `E_mean_3` | `mean(E[t-2:t])` | 3ヶ月未満なら存在する履歴で平均 |
| `E_mean_6` | `mean(E[t-5:t])` | 6ヶ月未満なら存在する履歴で平均 |
| `E_std_6` | `std(E[t-5:t], ddof=0)` | 6ヶ月未満では NaN |
| `E_std_12` | `std(E[t-11:t], ddof=0)` | 12ヶ月未満では NaN |
| `E_std_18` | `std(E[t-17:t], ddof=0)` | 18ヶ月未満では NaN |
| `E_iqr_6` | $Q_{75} - Q_{25}$（直近6ヶ月以内） | 履歴不足でも存在する分で計算 |

---

### 7.10 傾き・加速度群

| 指標 | 計算式 | 説明 |
|------|--------|------|
| `E_slope_6` | Theil-Sen（直近6点以内） | 6ヶ月ロバスト傾き |
| `E_slope_12` | Theil-Sen（直近12点以内） | 12ヶ月ロバスト傾き |
| `E_slope_3m` | 3点OLS回帰（直近3点、3点揃わなければNaN） | 3ヶ月OLS傾き |
| `E_slope_6_std_6` | $E\_slope\_6 / E\_std\_6$ | `E_std_6 > 0` のときのみ |
| `E_slope_6_std_12` | $E\_slope\_6 / E\_std\_12$ | `E_std_12 > 0` のときのみ |
| `E_ma3` | `rolling(3, min_periods=1).mean()` | 3ヶ月移動平均 |
| `V_slope_6` / `D_slope_6` / `A_slope_6` | Theil-Sen（直近6点以内） | 各次元の6ヶ月ロバスト傾き |

---

### 7.11 分布・エピソード群

`compute_expanding_episode_distribution_metrics()` により、**その時点までの累積履歴**に対して計算される。

| 指標 | 計算式・説明 |
|------|------------|
| `pct_high` | $\text{High バンド累積件数} / \text{累積月数}$ |
| `pct_mid` | $\text{Mid バンド累積件数} / \text{累積月数}$ |
| `pct_low` | $\text{Low バンド累積件数} / \text{累積月数}$ |
| `episodes_recovery` | 直前月が `Low`、当月が `Mid` または `High` になった回数の累積 |
| `episodes_fall` | 直前月が `Mid` または `High`、当月が `Low` になった回数の累積 |
| `recovery_rate` | $episodes\_recovery / episodes\_fall$（fall=0なら NaN） |
| `fall_rate` | $episodes\_fall / \text{累積月数}$ |
| `episodes_low2plus` | `Low` が2ヶ月連続に達した瞬間の回数の累積（3ヶ月目・4ヶ月目では増えない） |
| `low_streak_max` | その時点までの `Low` 連続最長月数 |

---

### 7.12 個人内変動指標群（direction_6 / volatility_6）

`add_personal_variability_features()` が算出する独立指標群。既存の階層的判定（`trend_base` / `trend_recent` / `trend_refined`）とは**独立**に、0–54 尺度の `engagement` に対して各 wave 時点で因果的（expanding）に算出する。

**設計思想**: 標準偏差ベースの `stability_6` や標準化傾き `E_slope_6_std_6`（= `E_slope_6 / E_std_6`）は方向性と変動性を混在させる。これを**方向（direction）と波動（volatility）に分離**し、さらに閾値を固定値ではなく**その個人の過去6か月窓の分位点（P90 / P75）** で定めることで、完全な個人内基準とする。

**窓の定義**: 各 wave t の直近6点 [t-5..t]（重複ローリング窓）。「有効窓」は `E_std_6` が NaN でない（6点揃う）行。各行の判定は、その行までの**過去の有効窓**（最新窓を除く）から閾値を作る。

**判定保留**:
- 窓が無効（`E_std_6` / `E_slope_6` が NaN, 履歴 < `DIR6_MIN_OBS`=6）→ 全カテゴリ `判定保留`、latest 値も NaN
- 過去窓数 < `DIR6_MIN_PAST_WINDOWS`（=5）→ カテゴリ `判定保留`・閾値 NaN（latest 値は数値出力）
- **direction の閾値 ≤ `STABILITY_RANGE_EPS`**（過去の方向変化がほぼ無く閾値が機能しない）→ 当該 `direction_6_p90/p75` のみ `判定保留`（閾値の数値は出力）

> **統計的留意点**: 重複ローリング窓は隣接窓が6点中5点を共有するため自己相関が強く、分位点はやや狭めに出る。データ量制約（個人あたり最大十数か月）下での実務的な近似である。

#### `direction_6_p90` / `direction_6_p75`（中期方向）

カテゴリ: `下降`, `上昇`, `方向変化なし`, `判定保留`。

- `direction_6_latest`（=D6）= $5 \times E\_slope\_6$（6ヶ月予測変化量, Theil-Sen 傾きベース）
- `direction_6_threshold_p90/p75` = $P90 / P75(|\text{過去窓の D6}|)$
- 判定は **= を含まない厳密な不等号**（`>`, `<`）。閾値が `STABILITY_RANGE_EPS` 以下なら `判定保留`。

| 条件 | 判定 |
|------|------|
| $T \leq$ `STABILITY_RANGE_EPS` | `判定保留` |
| $D6_{latest} > T$ | `上昇` |
| $D6_{latest} < -T$ | `下降` |
| それ以外 | `方向変化なし` |

p90 は厳しめ（検出少）、p75 は緩め（検出多）。$T_{p75} \leq T_{p90}$ のため p75 は p90 の上位集合として方向を検出する。なお厳密不等号のため、毎窓ほぼ一定ペースで推移してきた人（最新 D6 が自分の過去 P90 と同程度）は「その人にとって平常」として `方向変化なし` になる。

#### `volatility_6_p90` / `volatility_6_p75`（中期波動）

カテゴリ: `波動あり`, `波動なし`, `判定保留`。**`direction_6` の値に依存せず独立に算出**する。

- `residual_sd_6_latest`（=R6）= 最新窓の **OLS** 傾向線からの残差SD $SD(y - \hat{y})$（ddof=0）
- `volatility_6_threshold_p90/p75` = $P90 / P75(\text{過去窓の R6})$
- `sign_change_count_6` = 最新窓内の連続差分（`np.diff`）の符号反転回数。**差分 0 の月は除外**して計数する（`_count_sign_flips` がゼロをスキップ）。

| 条件 | 判定 |
|------|------|
| $R6_{latest} > T$ かつ `sign_change_count_6` $\geq$ `DIR6_SIGN_CHANGE_MIN`(=3) | `波動あり` |
| それ以外 | `波動なし` |

R6 は = を含まない厳密な不等号、符号反転回数は分かりやすさのため `>=`。符号反転回数のガード（>=3）により、残差が大きくても単調・単峰の動き（きれいなトレンドや単一のV字）は波動と判定されない（波動＝方向で説明できない反復的な上下変動）。

> 既存の `intervention_priority_neg/pos`（数値スコア）とは別系統の独立指標である。

---

## 8. 閾値一覧

### 8.1 傾き関連閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_SLOPE` | 0.5 | 中期傾き閾値（`trend_base` 条件1、`trend_refined` の `slope_ok` 判定） |
| `TREND_SLOPE_STD` | 0.58 | 標準化傾き閾値（`trend_base` 条件2） |
| `TREND_SLOPE_3M` | 5.0 | 6ヶ月未満履歴時の補助判定閾値（`trend_base` 条件3フォールバック、`slope_ok`、介入優先度） |
| `MIN_SLOPE` | 0.20 | 個人傾きの最小閾値（`mid_strength`/`mid_weakness` 判定） |

### 8.2 変化量関連閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_DELTA_STRONG` | 6.0 | 強い変化の閾値（`trend_recent` 急変判定） |
| `TREND_DELTA` | 2.0 | `trend_recent` の上昇／下降判定閾値、`trend_refined` Priority 8 判定 |
| `CHANGE_TAG_THRESHOLD` | 6.0 | `big_change_abs` の閾値 |
| `BIG_CHANGE_PERSONAL_Z` | 2.4 | 個人内変化大の閾値（`big_change`, `_calculate_change_tag`） |

### 8.3 V/D/A 次元閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `Z_VDA_THRESHOLD` | 0.8 | robust Z-score 閾値（strength/weakness 判定） |
| `SHORT_VDA_MIN_DELTA` | 2.0 | 短期変化の最小差分閾値 |
| `SECTION_THRESHOLD` | 0.5 | department内 Z-score による特性判定閾値 |

### 8.4 レベル閾値

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `LEVEL_THRIVING` | 43 | Thriving 判定（E > 43） |
| `LEVEL_HIGH` | 32 | High 判定（E > 32） |
| `LEVEL_LOW` | 11 | Low 判定（E < 11） |
| `LEVEL_CRITICAL` | 3 | Critical 判定（E < 3） |

### 8.5 安定性閾値（6ヶ月）

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_RANGE_EPS` | 1e-6 | E/V/D/A の6ヶ月レンジがこれ以下で「不変」 |
| `STD6_MIN_PAST_WINDOWS` | 5 | 個人内 E_std_6 閾値算出に必要な過去有効 E_std_6 数。未満は「判定保留」 |
| `STABILITY_STD_STABLE` | 1.0 | ※ stability_12 との整合のみ残存（stability_6 では未使用）|
| `STABILITY_MOMENTUM_STABLE` | 0.5 | ※ 同上 |
| `STABILITY_STD_UNSTABLE` | 3.3 | ※ 同上 |

### 8.6 安定性閾値（12ヶ月）

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_STD_STABLE_LONG` | 1.5 | E_std_12 がこれ以下で「持続安定」候補 |
| `STABILITY_MOMENTUM_STABLE_LONG` | 0.8 | `|E_momentum_6|` がこれ以下で「持続安定」候補 |
| `STABILITY_STD_UNSTABLE_LONG` | 3.7 | E_std_12 がこれ以上で「持続不安定」 |

### 8.7 履歴・エピソード関連

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `MID_MIN_RECORDS` | 2 | 中期トレンド計算に必要な最小レコード数 |
| `TRAIT_MIN_HISTORY` | 6 | 特性評価に必要な最小履歴数 |
| `LOW_EPISODE_THRESHOLD` | 2 | Low エピソード判定の連続月数閾値 |

### 8.8 特性評価

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TRAIT_WINDOW_MONTHS` | 12 | 特性評価の観測ウィンドウ |
| `TRAIT_MIN_PERIODS` | 3 | 最小期間 |
| `TRAIT_LEVEL_RATIO_MAX` | 0.8 | High/Low 比率上限（履歴≤6ヶ月） |
| `TRAIT_LEVEL_RATIO_MIN` | 0.6 | High/Low 比率下限（十分な履歴後） |
| `TRAIT_LEVEL_RATIO_DECAY` | 12 | 閾値を MAX → MIN に減衰させる期間 |
| `TRAIT_COUNT_EPS` | 1e-6 | 同率判定の許容誤差 |

### 8.9 slope3m_pattern 関連

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `SLOPE_PATTERN_WINDOW` | 12 | パターン判定ウィンドウ（月） |
| `NET_RATIO_THRESHOLD` | 0.7 | Net Growth/Decline の正負比率閾値 |
| `SLOPE12_THRESHOLD` | 0.4 | 12ヶ月傾きの絶対値閾値 |
| `SLOPE6_STD12_THRESHOLD` | 0.2 | 6ヶ月標準化傾きの絶対値閾値 |

### 8.10 個人内変動指標（direction_6 / volatility_6）

閾値は固定値ではなく個人の過去窓の分位点で動的に定めるため、定数は窓・母数・分位点・反転回数の制御のみ。

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `DIR6_MIN_OBS` | 6 | 有効窓に必要な最小履歴数（E_std_6 が NaN でない） |
| `DIR6_D6_HORIZON` | 5 | direction_6_latest = 5×E_slope_6（6ヶ月予測変化量） |
| `DIR6_MIN_PAST_WINDOWS` | 5 | P90/P75 閾値の最小母数（過去窓数）。未満は判定保留 |
| `DIR6_SIGN_CHANGE_MIN` | 3 | 波動あり判定に必要な窓内の符号反転回数（差分0は除外して計数） |
| `DIR6_PCTL_HIGH` | 90 | 厳しめ閾値の分位点（p90） |
| `DIR6_PCTL_MID` | 75 | 緩めの閾値の分位点（p75） |

---

## 9. 判定指標の詳細

### 9.1 level

`_level_from_e(val)` による5段階判定。評価順序に注意（上から順に最初にマッチしたものを返す）。

| 判定順 | 値 | 条件 |
|--------|-----|------|
| 1 | `""` | E が NaN |
| 2 | `"Thriving"` | E > 43 |
| 3 | `"Critical"` | E < 3 |
| 4 | `"High"` | E > 32 |
| 5 | `"Low"` | E < 11 |
| 6 | `"Moderate"` | いずれにも該当しない |

**バンド化** (`bandify_level`):
- High バンド: `Thriving`, `High`
- Mid バンド: `Moderate`
- Low バンド: `Low`, `Critical`
- `Unknown`: NaN

---

### 9.2 trend_base

中期（6ヶ月）の傾きに基づくトレンド判定。`apply_personal_trend_logic()` 内で算出。

**前提条件**: `MID_MIN_RECORDS = 2` を超えるレコード数が必要。不足の場合は `"未評価"`。

**判定条件**（3つの独立条件のいずれかを満たせば 上昇中 / 低下中）:

| 条件番号 | 上昇中 | 低下中 | 参照定数 |
|---------|--------|--------|---------|
| 条件1（傾き絶対値） | `E_slope_6 >= 0.5` | `E_slope_6 <= -0.5` | `TREND_SLOPE = 0.5` |
| 条件2（標準化傾き） | `E_slope_6_std_6 >= 0.58` | `E_slope_6_std_6 <= -0.58` | `TREND_SLOPE_STD = 0.58` |
| 条件3（フォールバック） | `E_slope_3m >= 5.0`（slope_std が NaN の場合のみ） | `E_slope_3m <= -5.0`（同） | `TREND_SLOPE_3M = 5.0` |

**条件1と条件2は独立**。条件1は slope_std の有無を問わない。条件2は slope_std が使える場合のみ評価される。条件3は slope_std が NaN（6ヶ月未満履歴）の場合にのみ評価される。

**補足**:
- 条件2は標準化傾きが十分大きければ生の傾きチェックなしで上昇中/低下中と判定する。これにより、分散が小さい個人でも有意な傾きを検出できる。
- 条件3は履歴3–5件のデータを高閾値の3ヶ月傾きで評価するフォールバック。

**副作用**: `trend_base == "未評価"` の場合、以下もリセットされる:
- 傾き系: `E_slope_6`, `E_slope_12`, `E_slope_6_std_6`, `E_slope_6_std_12`, `V_slope_6`, `D_slope_6`, `A_slope_6`
- 強み・弱み: `mid_strength`, `mid_weakness`

---

### 9.3 trend_recent

短期（直近1–2ヶ月）の変化に基づくトレンド判定。`apply_personal_trend_logic()` 内で算出。

使用する値: `delta = E_delta_1`、`delta_prev = E_delta_1_prev`

| 値 | 条件 |
|----|------|
| `"急上昇"` | `delta >= 6.0` |
| `"急落"` | `delta <= -6.0` |
| `"連続上昇"` | `delta >= 2.0` かつ `delta_prev >= 2.0` |
| `"連続下降"` | `delta <= -2.0` かつ `delta_prev <= -2.0` |
| `"上昇"` | `2.0 <= delta < 6.0` |
| `"下降"` | `-6.0 < delta <= -2.0` |
| `"横ばい"` | 上記いずれにも該当しない |

**優先順位**: 連続 > 急 > 通常 > 横ばい（numpy配列への代入順で後の条件が上書きする）

**注意**: 最初の月は `E_delta_1 = 0.0` なので常に `横ばい` になる。

---

### 9.4 trend_refined

`trend_base` と `trend_recent` を統合した17カテゴリーの詳細トレンド判定。`_refine_trend()` にて算出。

**内部で使用する補助判定**:

**`slope_ok`**:
$$slope\_ok = (|E\_slope\_6| > 0.5) \quad \text{OR} \quad (|E\_slope\_3m| \geq 5.0)$$

これにより、`trend_base` が条件3（フォールバック）で判定された場合（`E_slope_6` が小さくても `E_slope_3m` が 5.0 以上）でも `slope_ok = true` となり、`trend_refined` が `安定維持` に落ちる不整合を防ぐ。

**`change_tag`** (`_calculate_change_tag()`): **E_std_6** ベース。

| 値 | 条件 |
|----|------|
| `"増加変化大"` | `E_std_6 > 0` かつ `|E_delta_1| / E_std_6 > 2.4` かつ `E_delta_1 > 0` |
| `"減少変化大"` | `E_std_6 > 0` かつ `|E_delta_1| / E_std_6 > 2.4` かつ `E_delta_1 < 0` |
| `"not 変化大"` | 上記に該当しない |

**判定表**（優先度順）:

| 優先度 | 値 | trend_recent | trend_base | change_tag | その他条件 |
|--------|-----|-------------|-----------|-----------|-----------|
| 0 | `"入力疑義"` | — | — | — | `flag_constant_6m != ""` |
| 1 | `"上昇加速"` | up_trends | 上昇中 | 増加変化大 | slope_ok |
| 1 | `"低下加速"` | down_trends | 低下中 | 減少変化大 | slope_ok |
| 2 | `"上昇継続"` | up_trends または 横ばい | 上昇中 | not 変化大 | slope_ok かつ `E_delta_1 >= 0` |
| 2 | `"低下継続"` | down_trends または 横ばい | 低下中 | not 変化大 | slope_ok かつ `E_delta_1 <= 0` |
| 3 | `"復活"` | 上昇/急上昇 | 低下中 | 増加変化大 | slope_ok |
| 3 | `"悪化"` | 下降/急落 | 上昇中 | 減少変化大 | slope_ok |
| 4 | `"回復"` | up_trends | 低下中 | not 変化大 | — |
| 4 | `"低下危機"` | down_trends | 上昇中 | not 変化大 | — |
| 5 | `"上昇期待"` | up_trends | 安定 | — | — |
| 5 | `"低下警戒"` | down_trends | 安定 | — | — |
| 6 | `"低下懸念"` | 横ばい | 上昇中 | — | `E_delta_1 < 0` |
| 6 | `"回復期待"` | 横ばい | 低下中 | — | `E_delta_1 > 0` |
| 8 | `"上昇期待"` | 横ばい | 安定 | 増加変化大 | `E_delta_1_std > 2.0` |
| 8 | `"低下警戒"` | 横ばい | 安定 | 減少変化大 | `E_delta_1_std < -2.0` |
| 9 | `"上昇"` | 上昇/急上昇 | 未評価 | — | — |
| 9 | `"下降"` | 下降/急落 | 未評価 | — | — |
| 9 | `"横ばい"` | 横ばい | 未評価 | — | — |
| 10 | `"安定維持"` | 横ばい | 安定 | — | フォールバック含む |

※ up_trends = `["上昇", "急上昇", "連続上昇"]`、down_trends = `["下降", "急落", "連続下降"]`
※ Priority 8 の `E_delta_1_std` は `E_delta_1_std_12` を優先、NaN なら `E_delta_1_std_6`

**設計上の注意**:
- 優先度1–3の `slope_ok` チェックは、`trend_base` が条件2（標準化傾きのみ）または条件3（フォールバック）で判定された場合、生の傾きが小さい可能性があるため必要。
- 優先度4（回復/低下危機）には `slope_ok` チェックがない。これにより、傾きが小さくても最近の急変で判定される。

---

### 9.5 big_change / big_change_abs

**big_change**（出力カラム）: 個人の過去変動幅に対する相対的な変化の大きさと方向。**E_std_6** ベース。

| 値 | 条件 |
|----|------|
| `"増加変化大"` | `E_std_6 > 0` かつ `|E_delta_1| / E_std_6 >= 2.4` かつ `E_delta_1 > 0` |
| `"減少変化大"` | `E_std_6 > 0` かつ `|E_delta_1| / E_std_6 >= 2.4` かつ `E_delta_1 < 0` |
| `""` | 上記に該当しない | — |

**_calculate_change_tag**（`_refine_trend` 内部用）: 同様に **E_std_6** ベース。

| 値 | 条件 |
|----|------|
| `"増加変化大"` | `E_std_6 > 0` かつ `|E_delta_1| / E_std_6 > 2.4` かつ `E_delta_1 > 0` |
| `"減少変化大"` | `E_std_6 > 0` かつ `|E_delta_1| / E_std_6 > 2.4` かつ `E_delta_1 < 0` |
| `"not 変化大"` | 上記に該当しない（結果が `""` にならない点が出力カラムと異なる） |

**big_change_abs**: 固定閾値での変化判定。`|E_delta_1| >= 6.0` → `"変化大"`、それ以外 → `""`。

---

### 9.6 slope3m_pattern

直近12ヶ月の `E_slope_3m` の時系列パターンを分類する。**個人ごとに1つの値のみ**算出され、その人の全waveに同じ値が付与される（wave ごとの可変判定ではない）。

**使用する入力値**:
- `E_slope_3m` の直近12ヶ月分の時系列
- `E_slope_12`（最新値）
- `E_slope_6_std_12`（最新値）

**補助統計量**: N（有効点数）、r_pos/r_neg（正負比率）、mean_3m（平均）、flips（符号反転回数）、front_mean/back_mean（前半・後半平均）、first3/last3（最初・最後3点）

| 優先 | 値 | 判定条件 |
|------|-----|---------|
| 1 | `"Insufficient"` | N ≤ 3 |
| 2 | `"Net Growth"` | r_pos ≥ 0.7 かつ mean_3m > 0 かつ `|E_slope_12| >= 0.4` かつ `|E_slope_6_std_12| >= 0.2` |
| 3 | `"Net Decline"` | r_neg ≥ 0.7 かつ mean_3m < 0 かつ `|E_slope_12| >= 0.4` かつ `|E_slope_6_std_12| >= 0.2` |
| 4 | `"U-Shape"` | front_mean < 0 かつ back_mean > 0 かつ first3 の負数 ≥ 2 かつ last3 の正数 ≥ 2 |
| 5 | `"Inverted-U"` | front_mean > 0 かつ back_mean < 0 かつ first3 の正数 ≥ 2 かつ last3 の負数 ≥ 2 |
| 6 | `"Oscillating"` | flips ≥ 3 |
| 7 | `"Flat/Noisy"` | 上記いずれにも該当しない |

---

## 10. 介入優先度スコア詳細

`calculate_intervention_priority(row)` が以下の各項目のスコアを加算する。`intervention_priority_neg` と `intervention_priority_pos` を独立に算出。`flag_constant_6m` 加点（§(8)）のみ関数外（`run()` 内）で後処理加算する。

### (1) trend_base（0–1点）

| 条件 | neg | pos |
|------|-----|-----|
| `trend_base == "低下中"` | +1 | — |
| `trend_base == "上昇中"` かつ `trend_recent ∈ {下降, 急落, 連続下降}`（下降反転） | +1 | — |
| `trend_base == "上昇中"`（上記以外） | — | +1 |

**下降反転の振替**: 中期は上昇基調（`trend_base="上昇中"`）でも直近トレンドが下降系に反転している場合（「低下危機」等の早期警戒）、上昇基調の pos +1 を **neg +1 に振り替える**。直近反転は §(2) E_delta_1 で neg +1 程度しか稼げず、上昇基調由来の pos 点に打ち消されて早期警戒対象がアクション候補に出ない問題への対処。上昇反転（`trend_base="低下中"` × `trend_recent` 上昇系＝回復）は対象外で従来どおり neg +1。**Admin/engagement_management.gs の calculateInterventionPriority と完全同期（we-system Section 3）。**

### (1b) trend_refined 低下継続（持続的低下の高止まり、neg のみ）

| 条件 | neg | pos |
|------|-----|-----|
| `trend_refined == "低下継続"` | +1 | — |

「低下継続」= `trend_base="低下中"` ＋ 直近は下降/横ばい ＋ 大きな変化なし ＋ 6か月の実下降（`slope_ok`）。大きく低下した後に低位で高止まりすると §(2) E_delta_1・§(6) 傾きベースの加点が減衰し、§(1) `trend_base` 低下中の neg +1 しか残らず候補から漏れる。持続的低下を介入優先度に残すための加点で、`trend_base` 低下中(+1)との二重計上は意図的（§(4) stability＋volatility と同じ設計）。**neg のみ加点**（上昇継続＝pos 側には加点しない非対称）。**Admin/engagement_management.gs と完全同期（we-system Section 3）。**

### (2) trend_recent 直近トレンド（0–3点）

直近変化は `trend_recent` カテゴリで加点する。`trend_recent` は `E_delta_1` / `E_delta_1_prev` から導出される（§9 短期トレンド：急=|Δ|≥6、上昇/下降=2≤|Δ|<6、連続=2期連続|Δ|≥2、優先順位「連続>急>通常」）ため、**旧「生 E_delta_1 加点」は同一ソースの重複**だった。これを `trend_recent` に一本化し、直近の寄与を厚くした。

| trend_recent | neg | pos |
|------|-----|-----|
| `急上昇` | — | +3 |
| `連続上昇` | — | +3 |
| `上昇` | — | +2 |
| `急落` | +3 | — |
| `連続下降` | +3 | — |
| `下降` | +2 | — |
| `横ばい` | 0 | 0 |

**急＝連続＝±3** とした理由: 分類は「連続が急を上書きする」ため、`連続下降`（大幅かつ持続的な低下も含む）が `急落`（単発の大幅低下）より軽く評価されるのを避ける。`上昇/下降` は ±2。`横ばい`（|Δ|<2）は 0（個人内基準の微小変化は §(3) big_change が拾う）。

### (3) big_change（0–1点）

| 条件 | neg | pos |
|------|-----|-----|
| `big_change == "減少変化大"` | +1 | — |
| `big_change == "増加変化大"` | — | +1 |

### (4) stability_6 / volatility_6_p90（方向不問・neg のみ）

個人内基準の `stability_6` と `volatility_6_p90` をいずれも**方向不問で neg に加点**する（上昇局面の不安定・波動も負方向シグナルとして扱う）。両方発火時は合算（最大 +2）。

`stability_6` は個人内 P90/P75 基準のため、Playbook と Admin GAS の閾値定義は独立（Admin は組織固定閾値）。

| 条件 | neg | pos |
|------|-----|-----|
| `stability_6 == "不安定"` | +1 | — |
| `stability_6 == "やや不安定"` | +1 | — |
| `volatility_6_p90 == "波動あり"` | +1 | — |

> `volatility_6_p90` は中期指標のため、短期判断（§(2) trend_recent）を埋もれさせないよう neg +2 → **+1** に引き下げ（stability_6 と同重み）。

> 算出順：`add_personal_variability_features()`（volatility_6_p90 を生成）を `calculate_intervention_priority()` の**前**に実行する（`run()` 内）。

### (5) E_delta_1_std 段階スコア（**廃止**）

`E_delta_1_std = E_delta_1 / stdNorm` は §(2) trend_recent と同じ「今月の変化」を別正規化しただけで重複するため、直近変化を trend_recent に一本化した際に**削除した**。個人内基準の単月変化は §(3) big_change（個人Z |Δ|/E_std_6≥2.4）が neg/pos ±1 で拾う。
※ `E_delta_1_std_12` 列自体は出力に残る（他用途）。`trend_recent`/`trend_refined` の導出（§9）でも別途参照される。

### (6) E_slope_6_std 段階スコア（0–4点）

`E_slope_6_std_12` を優先使用。NaN の場合は `E_slope_6_std_6` にフォールバック。符号で neg/pos を振り分ける。

| `|E_slope_6_std|` の範囲 | 段階スコア |
|-------------------------|----------|
| 0 < abs ≤ 0.25 | 0 |
| 0.25 < abs ≤ 0.50 | 1 |
| 0.50 < abs ≤ 1.00 | 2 |
| 1.00 < abs ≤ 1.50 | 3 |
| 1.50 < abs | 4 |

### (7) E_slope_3m 直近3ヶ月トレンド（0–1点）

| 条件 | neg | pos |
|------|-----|-----|
| `E_slope_3m <= -5.0` | +1 | — |
| `E_slope_3m >= 5.0` | — | +1 |

### (8) flag_constant_6m 加点（neg のみ、0–3点）

`calculate_intervention_priority()` 実行後に `run()` 内で別途加算される。調査抵抗者の多くが毎月アクション候補に出続けるのを避けるため、従来（4/3/2/2）から引き下げた（中期指標のため短期判断を埋もれさせない）。

| 値 | neg への加算 |
|-----|------------|
| `FIX_SHIFTED` | +3 |
| `LOW_FIXED` | +2 |
| `MID_EVASION` | +1 |
| `HIGH_AVOIDANCE` | +1 |

### スコア範囲

| スコア | 理論上の最大値（flag_constant_6m加点前） |
|--------|----------------------------------------|
| `intervention_priority_neg` | base1＋低下継続1＋trend_recent3＋stability1＋volatility1＋E_slope_6_std4＋slope_3m1 = **12** |
| `intervention_priority_pos` | base1＋trend_recent3＋big_change1＋E_slope_6_std4＋slope_3m1 = **10** |

flag_constant_6m の FIX_SHIFTED 加点が入ると neg は最大 **15**。

### Adminプロジェクトとの比較

| 項目 | we_analyzer.py | Admin (engagement_management.gs) |
|------|---------------|----------------------------------|
| E_slope_6_std のフォールバック | `_std_12` → `_std_6` | `_std_12` のみ（フォールバックなし、下記注参照） |
| 直近変化の加点 | trend_recent カテゴリ（§10(2)、急=連続±3/上昇下降±2） | 同一（完全同期） |
| flag_constant_6m 加点 | `run()` 内で後処理加算（FIX_SHIFTED3/LOW_FIXED2/MID/HIGH1） | `calculateInterventionPriority` 内でインライン加算（同値） |

> **フォールバック差は実害ほぼなし（Admin に追加しない方針）**:
> Admin は RatingSS を読むが **RatingSS には `_std_6` 列が無く**（Report/evaluate.gs は `_std_12` のみ出力）、構造的にフォールバックできない。追加するには Report→RatingSS の列追加＋Admin Globals/列順変更（デプロイ順依存の大改修）が必要。
> 一方で `_std_12` が NaN になるのは ①在籍 < 6か月（`_std_6` も計算不可）か ②固定値回答者（`E_std=0` → `_std_6` も NaN）のいずれかで、**Playbook 側のフォールバックでも救済できる人はほぼいない**（実データ 2026-05: 救済 0 名）。②は `flag_constant_6m` で別途 neg を獲得済み。よって両者の値の食い違いは実質ゼロで、Admin にフォールバックを追加する利得はない。
> なお `E_delta_1_std` の段階スコアは §10(5) のとおり廃止済みのため、フォールバック差はそもそも介入優先度に影響しない。

### スコアの解釈

| 状態 | 意味 |
|------|------|
| neg が高い | 低下方向の変化が多面的に確認 → 負の介入（支援・介入）の優先度が高い |
| pos が高い | 上昇方向の変化が多面的に確認 → 正の変化の観察・強化の優先度が高い |
| neg/pos ともに低い | 安定しているか、明確な変化がない |
| neg と pos が同時に高い | 稀。異なる指標が相反するシグナルを示している状態（例: 短期急上昇だが中期低下中） |

---

## 11. 出力に含まれない内部計算列

保守上重要な内部列。最終 Excel 出力には含まれない。

| 列名 | 説明 |
|------|------|
| `Prev_E_slope_6` | 前回時点の `E_slope_6`。最初は当月値で代用 |
| `E_min6_past` | `apply_personal_trend_logic()` 内で作られる直近6ヶ月の過去最小。現行の `_refine_trend()` では実質未使用 |
| `E_max6_past` | 直近6ヶ月の過去最大。同上 |
| `*_z_section` | `[wave, department]` 単位の Z-score（trait 判定で使用） |
| `*_z_group` | `[wave, section]` 単位の Z-score |

**Z-score の計算式**:

$$z = \frac{x - \mu}{\sigma}$$

`σ = 0` または NaN の場合は `0.0`。サフィックス `_z_section` は department レベル、`_z_group` は section レベルで計算される（歴史的命名規則による逆転に注意）。

---

## 12. 実装上の注意点・仕様上の癖

### 12.1 `trend_base` の履歴条件は「6ヶ月」ではない

「中期トレンド」という名前だが、評価可否条件は`履歴件数 > 2`。`E_std_6` や `E_slope_6_std_6` が安定して使えるのは6ヶ月以降なので、初期数ヶ月は条件3（`E_slope_3m` フォールバック）の影響を受ける。

### 12.2 `trend_recent` は初期月でも `横ばい` が付く

最初の月は `E_delta_1 = 0.0` なので、常に `横ばい` になる。

### 12.3 `big_change` と `big_change_abs` は基準が異なる

- `big_change`: 個人内標準偏差基準（E_std_6）で相対評価
- `big_change_abs`: 生の絶対差分基準（6.0固定）

両者が矛盾することはある（例: E_std_6 が大きい人なら big_change が付かないが big_change_abs は付く）。

### 12.4 `_calculate_change_tag` は E_std_6 ベース

`_refine_trend()` 内部で使われる `_calculate_change_tag()` は、`big_change` 出力カラムと同じ **E_std_6** を使用する。古い設計メモで「E_std_12」と記述されていることがあるが、現行コードは E_std_6 である。

### 12.5 `slope3m_pattern` は月ごとではなく「人ごと」

関数は個人ごとに1回だけ判定し、結果をその人の全wave に付与する。したがって `monthly_trends` シートで同一人物の全行に同じ値が入る。

### 12.6 `trait_*` は部門内相対評価

V/D/A の強み・弱みは生スコアではなく `*_z_section` を使う。したがって組織構成や部門平均との差の影響を受ける。同じ絶対スコアでも部門によって trait が異なりえる。

### 12.7 `mid_window` と `E_slope_6` の非連動

`mid_window`（デフォルト6）は以下に影響する:
- `overwrite_short_mid_personal()` の `*_slope_mid_window`
- `_compute_stability()` の6ヶ月安定性計算

ただし `add_multiscale_features()` の `E_slope_6` や `V_slope_6` は固定6ヶ月であり、`mid_window` を変更しても完全には連動しない。将来の拡張時の設計上の不整合候補。

### 12.8 出力に含まれない計算列がある

`Prev_E_slope_6`, `E_min6_past`, `E_max6_past`, Z-score 系列などは内部計算だけに使われる（§11参照）。

---

## 13. 変更時の影響範囲

### 13.1 閾値変更の波及

| 変更定数 | 影響する指標 |
|---------|------------|
| `TREND_SLOPE` (0.5) | `trend_base`（条件1）、`trend_refined`（slope_ok）、`intervention_priority_*`（E_slope_3m 加点には無関係） |
| `TREND_SLOPE_STD` (0.58) | `trend_base`（条件2）、`trend_refined` |
| `TREND_SLOPE_3M` (5.0) | `trend_base`（条件3フォールバック）、`trend_refined`（slope_ok）、`intervention_priority_*`（E_slope_3m 加点） |
| `TREND_DELTA_STRONG` (6.0) | `trend_recent`（急変判定）、`intervention_priority_*`（E_delta_1 加点） |
| `TREND_DELTA` (2.0) | `trend_recent`（通常変化判定）、`trend_refined`（Priority 8）、`intervention_priority_*` |
| `CHANGE_TAG_THRESHOLD` (6.0) | `big_change_abs` のみ |
| `BIG_CHANGE_PERSONAL_Z` (2.4) | `big_change`, `_calculate_change_tag`（→ `trend_refined`） |
| `STABILITY_*` | `stability_6`, `stability_12`, `intervention_priority_*` |
| `Z_VDA_THRESHOLD`, `SHORT_VDA_MIN_DELTA`, `MIN_SLOPE` | `short_*`, `mid_*` |
| `TRAIT_*`, `SECTION_THRESHOLD` | `trait_*` とその confidence 列 |

### 13.2 出力列追加・削除の変更点

出力列は `run()` の `monthly_cols` で固定列順管理されている。列を増やしたい場合は以下3箇所の確認が必要：

1. 計算処理を追加
2. `monthly_cols` に列名追加
3. `_write_excel_output()` の数値書式リストも必要に応じて更新

### 13.3 中期ウィンドウ変更

`--mid-window` 引数変更時は §12.7 の非連動に注意。

---

## 14. 保守観点での改善候補

1. `validate_input_data()` の strict モード追加（停止する強検証オプション）
2. `trend_refined` の判定表をデータ駆動化（現在はハードコーディングされた if/elif の連鎖）
3. `mid_window` と `E_slope_6` 系固定値の整合化
4. `slope3m_pattern` を wave ごとの可変判定にするか、個人固定と明記するかの設計整理
5. `E_min6_past`, `E_max6_past` の未使用整理
6. Excel 出力列定義を設定ファイル化

---

## 15. 実行方法

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

| ライブラリ | 必須 | 説明 |
|-----------|------|------|
| `numpy` | 必須 | |
| `pandas` | 必須 | |
| `xlsxwriter` | オプション | Excelフォーマット設定用。なくても動作する |
