# WEプレイブック出力仕様（外部仕様／内部仕様）

作成日: 2025-11-05（更新）
対象: `shortterm`, `longterm`, `monthly_trends`, `LatestIndividuals` の4シート
前提入力: `workengagement.xlsx`（raw: year, month, mail_address, Engagement/各UWES項目, ほか属性）
出力: `we_playbook.xlsx`

---

## 概要

### シート構成と出力順序

1. **shortterm** - 最新Wave時点のメンバー短期状態（即応アクション判断用）
2. **longterm** - 個人の長期傾向・特性サマリー（育成・配置戦略用）
3. **monthly_trends** - 全員×全Waveの時系列データ（検証・分析用）
4. **LatestIndividuals** - 最新Waveのみの時系列データ（monthly_trendsと同じ列構成）

### 入力データ要件

- **必須列**: `year`, `month`, `mail_address`, `vigor_rating`, `dedication_rating`, `absorption_rating`
- **オプション列**: `engagement_rating`, `name`, `project`, `grade`, `section`, `group`
- **Engagement**: `engagement_rating` が優先、無い場合は V+D+A で算出

---

## 1. shortterm

### 1.1 外部仕様（ユーザー向け）

**目的**: 最新Wave（月）時点のメンバーの短期状態と即応アクション判断のためのビュー。

**行粒度**: 1レコード = 1人 × 最新Wave（例: 2025-09）

**列定義**（全12列）

| 列名 | 型/表示 | 意味・備考 |
|---|---|---|
| `__person__` | 文字列 | 個人ID（mail_addressを小文字・trim正規化） |
| `name` | 文字列 | 氏名 |
| `project` | 文字列 | 所属プロジェクト/ユニット |
| `grade` | 文字列/数値 | 等級 |
| `__section__` | 文字列 | 部署（大分類） |
| `__group__` | 文字列 | グループ（中分類） |
| `__wave__` | 日付（`yyyy-mm`） | Wave（月末Timestamp） |
| `Level_A` | カテゴリ | Thriving / High / Moderate / Low / Critical |
| `Trend_B_refined` | カテゴリ | 短期トレンド（13種類：上昇加速、回復、復活、上昇継続、上昇期待、安定維持、低下懸念、低下警戒、悪化、低下危機、低下加速、低下継続、回復期待、未評価） |
| `flag_constant_6m` | 真偽 | 直近6ヶ月以上、E/V/D/Aが完全不変ならTRUE（入力妥当性チェック） |
| `ShortTerm_ArchetypeJP` | 文字列 | `Level_A × Trend_B_refined`（例: `High×上昇継続`） |
| `AnalysisFlag` | カテゴリ | `flag_constant_6m=TRUE ∧ Trend_B_refined=安定維持` → `分析不可（入力疑義）` / それ以外→`有効` |

**表示ルール**
- `__wave__`はセル書式`yyyy-mm`
- Freeze panes: name カラムまで（C列まで）固定
- Auto filter: 全列
- 最新Waveにデータが無い人は掲載しない

### 1.2 内部仕様（実装・ロジック）

**キー整合**
- `__person__` = `mail_address`.lower().strip()
- `__wave__` = `year`+`month` → `to_period('M')` → 月末Timestamp

**Level_A**
- Engagement値から5段階判定: Thriving (>43) / High (>32) / Moderate / Low (<11) / Critical (<3)

**Trend_B_refined**
- `decision_logic.md` に基づく13種類のトレンド判定
- E_slope_6, E_momentum_3, E_delta_1 などの多層指標を用いた優先順位ルール

**flag_constant_6m**（入力妥当性チェック）
- 各人の時系列をWave昇順に走査
- 比較対象タプル: `(E_num, vigor_rating, dedication_rating, absorption_rating)`
- 値が変わらない連続区間の最長長さを算出
- `最長区間 >= 183日` → TRUE

**ShortTerm_ArchetypeJP**
- 文字列連結: `Level_A + "×" + Trend_B_refined`

**AnalysisFlag**
- 条件: `flag_constant_6m==TRUE` かつ `Trend_B_refined=="安定維持"` → `分析不可（入力疑義）`

---

## 2. longterm

### 2.1 外部仕様（ユーザー向け）

**目的**: 個人の**全期間**の傾向・特性を凝縮し、人材育成・配置・動機づけの**設計指針**を与える。

**行粒度**: 1レコード = 1人（全期間集計）

**列定義**（全24列）

| 列名 | 型/表示 | 意味・備考 |
|---|---|---|
| `__person__` | 文字列 | 個人ID |
| `name` | 文字列 | 氏名 |
| `slope3m_pattern` | カテゴリ | 長期推移パターン（Net Growth / Net Decline / U-Shape / Inverted-U / Oscillating / Flat/Noisy / Insufficient）|
| `episodes_recovery_from_low` | 整数 | Low→(Mid/High) への転換回数（全期間） |
| `episodes_fall_to_low` | 整数 | (Mid/High)→Low への転換回数（全期間） |
| `pct_high` | 数値(0.00) | High比率（全観測に対する割合） |
| `pct_mid` | 数値(0.00) | Mid比率 |
| `pct_low` | 数値(0.00) | Low比率 |
| `low_streak_max` | 整数 | 連続Lowの最長長さ（全期間） |
| `episodes_low_2plus` | 整数 | 連続Low≧2 のエピソード数（全期間） |
| `Long_trait_strength` | 文字列 | 長期の強み（同率最頻は複数カンマ列挙。要素: 活力/熱意/没頭） |
| `Long_trait_strength_V` | 文字列(Y/空) | 活力がトップに含まれるか |
| `Long_trait_strength_D` | 文字列(Y/空) | 熱意がトップに含まれるか |
| `Long_trait_strength_A` | 文字列(Y/空) | 没頭がトップに含まれるか |
| `Long_trait_strength_conf_V` | 数値(0.00) | 活力の支持率（出現数/総出現数） |
| `Long_trait_strength_conf_D` | 数値(0.00) | 熱意の支持率 |
| `Long_trait_strength_conf_A` | 数値(0.00) | 没頭の支持率 |
| `Long_trait_weakness` | 文字列 | 長期の弱み（同率最頻は複数カンマ列挙） |
| `Long_trait_weakness_V` | 文字列(Y/空) | 活力がトップに含まれるか |
| `Long_trait_weakness_D` | 文字列(Y/空) | 熱意がトップに含まれるか |
| `Long_trait_weakness_A` | 文字列(Y/空) | 没頭がトップに含まれるか |
| `Long_trait_weakness_conf_V` | 数値(0.00) | 活力の支持率 |
| `Long_trait_weakness_conf_D` | 数値(0.00) | 熱意の支持率 |
| `Long_trait_weakness_conf_A` | 数値(0.00) | 没頭の支持率 |

**表示ルール**
- 整数列（episodes_*, low_streak_max）は整数フォーマット（`0`）
- 比率列（pct_*）は小数第2位（`0.00`）
- 支持率列（*_conf_*）は小数第2位（`0.00`）
- Freeze panes: name カラムまで（B列まで）固定
- Auto filter: 全列

**注記**
- 属性カラム（project, grade, section, group）は**含まれない**（個人分析に特化）

### 2.2 内部仕様（実装・ロジック）

**データ源**
- `slope3m_pattern`: monthly_trends の `slope_3m` 系列から判定（全期間）
- `episodes_* / pct_* / low_streak_max / episodes_low_2plus`: 全期間の `Level_A` から算出（最終Wave時点の累積値）
- `Long_trait_*`: 全期間の `C_trait_strength` / `C_trait_weakness` から集計

**判定ロジック**

**slope3m_pattern**：
- `slope_3m` の符号比率・平均・符号変化回数でルール判定
- 例: 正比率≥0.7 かつ平均>0 → `Net Growth`、負比率≥0.7 かつ平均<0 → `Net Decline`
- 前半<0/後半>0 → `U-Shape`、前半>0/後半<0 → `Inverted-U`
- データ点数<3 → `Insufficient`

**Level_A バンド化**（エピソード・分布指標用）：
- **High グループ**: Thriving, High
- **Mid グループ**: Moderate
- **Low グループ**: Low, Critical

**episodes_recovery_from_low**：
- 時系列で Low→(Mid/High) の転換をカウント
- Critical→Moderate も Low→Mid として検出される

**episodes_fall_to_low**：
- 時系列で (Mid/High)→Low の転換をカウント
- Moderate→Critical も Mid→Low として検出される

**pct_***：
- バンド化後の出現比（観測総数に対する割合）
- `pct_high + pct_mid + pct_low = 1.0`

**low_streak_max**：
- Low（Critical含む）の連続長の最長値
- 例: Low 26回連続 → `low_streak_max = 26`

**episodes_low_2plus**：
- Low（Critical含む）連続区間（長さ≥2）の個数
- 例: 1つの長いエピソード（26回連続） → `episodes_low_2plus = 1`
- 例: 4つの短いエピソード（それぞれ2回以上） → `episodes_low_2plus = 4`

**Long_trait_***：
- 各Waveの `C_trait_strength`（または`C_trait_weakness`）は「活力/熱意/没頭」のカンマ区切り複数を許容
- 全観測で V/D/A をカウントし、**最大カウントに並ぶ全次元**をトップとして採用（複数可）
- `*_V/D/A` はトップに含まれる次元を "Y"
- `*_conf_*` は `counts[dim]/total`

**欠損・エッジケース**
- `Level_A` 全欠損 → `episodes_*`/`pct_*`/`streak`系は 0 または NaN
- `C_trait_*` 全欠損 → `Long_trait_*` は空、`*_conf_*` は NaN
- `slope_3m` データ点数<3 → `slope3m_pattern = Insufficient`

---

## 3. monthly_trends

### 3.1 外部仕様（ユーザー向け）

**目的**: 全メンバーの全Wave時系列データを含む**検証・分析用**シート。shortterm/longtermのカテゴリー分類の基礎データを時系列で確認可能。

**行粒度**: 1レコード = 1人 × 1Wave（実際の観測月）

**列定義**（全45列）

| カテゴリ | 列名 | 型/表示 | 意味・備考 |
|---|---|---|---|
| **キー** | `__person__` | 文字列 | 個人ID |
| | `name` | 文字列 | 氏名 |
| | `__wave__` | 日付（`yyyy-mm`） | Wave（月末Timestamp） |
| **UWES** | `vigor_rating` | 整数 | 活力（0-18） |
| | `dedication_rating` | 整数 | 熱意（0-18） |
| | `absorption_rating` | 整数 | 没頭（0-18） |
| | `Engagement` | 整数 | 総エンゲージメント（0-54） |
| **分類** | `Level_A` | カテゴリ | Thriving/High/Moderate/Low/Critical |
| | `Trend_B_base` | カテゴリ | 基礎トレンド（上昇中/安定/低下中/未評価） |
| | `Trend_B_recent` | カテゴリ | 直近トレンド（上昇/横ばい/下降） |
| | `Trend_B_refined` | カテゴリ | 優先判定トレンド（13種類） |
| | `ChangeTag` | 文字列 | \|E_delta_1\|≥6.0 なら「変化大」 |
| **安定性** | `C_stability` | カテゴリ | 不変/安定/やや安定/不安定 |
| **個人内強み/弱み** | `C_short_strength` | 文字列 | 短期強み（活力/熱意/没頭） |
| | `C_short_weakness` | 文字列 | 短期弱み |
| | `C_mid_strength` | 文字列 | 中期強み |
| | `C_mid_weakness` | 文字列 | 中期弱み |
| **特性** | `C_trait_strength` | 文字列 | 12ヶ月ロール特性強み |
| | `C_trait_weakness` | 文字列 | 12ヶ月ロール特性弱み |
| **多層指標** | `E_momentum_3` | 数値(0.00) | 3ヶ月モメンタム |
| | `E_delta_1` | 数値(0.00) | 前月差分 |
| | `E_delta_1_prev` | 数値(0.00) | 前々月差分 |
| | `E_mean_6` | 数値(0.00) | 6ヶ月平均 |
| | `E_std_6` | 数値(0.00) | 6ヶ月標準偏差 |
| | `E_iqr_6` | 数値(0.00) | 6ヶ月IQR |
| | `E_slope_12` | 数値(0.00) | 12ヶ月Theil-Sen傾き |
| | `E_slope_6` | 数値(0.00) | 6ヶ月Theil-Sen傾き |
| | `E_accel_6` | 数値(0.00) | 6ヶ月加速度 |
| **月次メトリクス** | `E_ma3` | 数値(0.00) | 3ヶ月移動平均 |
| | `slope_3m` | 数値(0.00) | 3点単回帰傾き |
| | `slope_3m_ma3` | 数値(0.00) | slope_3m の3ヶ月移動平均 |
| | `accel_3m` | 数値(0.00) | slope_3m の加速度 |
| **エピソード・分布** | `episodes_recovery_from_low` | 整数 | Low→(Mid/High)転換回数（**expanding累積**） |
| **(expanding)** | `episodes_fall_to_low` | 整数 | (Mid/High)→Low転換回数（**expanding累積**） |
| | `pct_high` | 数値(0.00) | High比率（**expanding累積**） |
| | `pct_mid` | 数値(0.00) | Mid比率（**expanding累積**） |
| | `pct_low` | 数値(0.00) | Low比率（**expanding累積**） |
| | `low_streak_max` | 整数 | 連続Lowの最長長さ（**expanding累積**） |
| | `episodes_low_2plus` | 整数 | 連続Low≥2エピソード数（**expanding累積**） |
| **次元別** | `V_delta_1` | 数値(0.00) | 活力の前月差分 |
| | `D_delta_1` | 数値(0.00) | 熱意の前月差分 |
| | `A_delta_1` | 数値(0.00) | 没頭の前月差分 |
| | `V_slope_6` | 数値(0.00) | 活力の6ヶ月傾き |
| | `D_slope_6` | 数値(0.00) | 熱意の6ヶ月傾き |
| | `A_slope_6` | 数値(0.00) | 没頭の6ヶ月傾き |

**表示ルール**
- `__wave__`はセル書式`yyyy-mm`
- 整数列（UWES、episodes_*, low_streak_max）は整数フォーマット（`0`）
- 数値列は小数第2位（`0.00`）
- 比率列（pct_*）は小数第2位（`0.00`）
- Freeze panes: name カラムまで（B列まで）固定
- Auto filter: 全列

**注記**
- 属性カラム（project, grade, section, group）は**含まれない**（個人分析に特化）
- エピソード・分布指標は**expanding計算**（各Wave時点までの累積値）

### 3.2 内部仕様（実装・ロジック）

**多層時系列特徴量**
- `add_multiscale_features()` で E/V/D/A の6ヶ月/12ヶ月傾き、モメンタム、IQR等を計算
- Theil-Sen傾き推定（外れ値に頑健）を使用

**個人内強み/弱み**
- `overwrite_short_mid_personal()` で expanding quantile と robust Z-score（MAD）を用いた適応的閾値判定
- 短期: delta_1 の expanding 90%ile/10%ile と robust Z-score
- 中期: slope_6 の expanding 90%ile/10%ile と robust Z-score

**トレンド判定**
- `apply_personal_trend_logic()` で Trend_B_base, Trend_B_recent, Trend_B_refined を計算
- 詳細は `ANALYSIS_LOGIC.md` と `decision_logic.md` を参照

**安定性・特性**
- `compute_C_columns()` で C_stability（不変/安定/やや安定/不安定）と C_trait_* を計算
- C_trait_*: 12ヶ月ローリング中央値でセクション内Z-scoreを評価

**月次メトリクス**
- `compute_monthly_metrics()` で E_ma3, slope_3m, slope_3m_ma3, accel_3m を計算
- データはすでに月次なので、リサンプリング不要（E_monthly は削除済み）

**エピソード・分布指標（expanding計算）**
- `compute_expanding_episode_distribution_metrics()` で各Wave時点までの累積値を計算
- **重要**: 各Waveの値は、その人の最初のWaveからその時点までのデータで計算される
- Level_A をバンド化（Critical→Low, Thriving→High）してからエピソード検出

**expanding計算の例**:
```
Wave 1: Moderate → episodes_recovery_from_low=0, pct_high=0.00, pct_mid=1.00, pct_low=0.00
Wave 2: Low      → episodes_recovery_from_low=0, pct_high=0.00, pct_mid=0.50, pct_low=0.50
Wave 3: Low      → episodes_recovery_from_low=0, pct_high=0.00, pct_mid=0.33, pct_low=0.67
Wave 4: Moderate → episodes_recovery_from_low=1, pct_high=0.00, pct_mid=0.50, pct_low=0.50
...
```

**欠損・エッジケース**
- MID_MIN_RECORDS（=3）以下の場合、傾き・安定性関連指標は NaN
- 3点未満では slope_3m/accel_3m は NaN
- 観測が全く無い人は出力しない

---

## 4. LatestIndividuals

### 4.1 外部仕様（ユーザー向け）

**目的**: 最新Wave時点のメンバーの詳細データ（monthly_trendsと同じ列構成）

**行粒度**: 1レコード = 1人 × 最新Wave（例: 2025-09）

**列定義**: monthly_trends と同じ（全45列）

**表示ルール**
- monthly_trends と同じフォーマット
- Freeze panes: name カラムまで（B列まで）固定
- Auto filter: 全列
- 最新Waveにデータが無い人は掲載しない

### 4.2 内部仕様（実装・ロジック）

**データ源**
- monthly_trends から最新Wave（グローバル最大Wave）のレコードをフィルタ

**注記**
- エピソード・分布指標は expanding 計算の最終値（全期間の累積値）
- longterm シートの値と一致する

---

## 5. 共通仕様

### 5.1 キー・正規化

- **`__person__`**: `mail_address`.lower().strip()
- **`__wave__`**: `year`+`month` → `to_period('M')` → 月末Timestamp

### 5.2 数値・日付フォーマット

- **日付**: `yyyy-mm`
- **整数**: `0`（UWES項目、episodes_*, low_streak_max, episodes_low_2plus）
- **小数**: `0.00`（その他の数値、pct_*, *_conf_*）

### 5.3 Level_A バンド化

エピソード・分布指標の計算では、Level_A を3グループにバンド化：

| バンド | Level_A の値 |
|---|---|
| **High** | Thriving, High |
| **Mid** | Moderate |
| **Low** | Low, Critical |

**注記**: Critical は Low と同じ仲間、Thriving は High と同じ仲間として扱われます。

### 5.4 定数（しきい値）

主要な定数は `build_we_playbook.py` の冒頭で定義：

| 定数 | デフォルト値 | 用途 |
|---|---|---|
| `TREND_SLOPE_POS`, `TREND_SLOPE_NEG` | ±0.35 | 基礎トレンド傾き閾値 |
| `TREND_MOMENTUM_STRONG` | 1.5 | 強いモメンタム閾値 |
| `TREND_DELTA_STRONG` | 5.0 | 強い変化閾値 |
| `LEVEL_THRIVING` | 43 | Thriving閾値 |
| `LEVEL_HIGH` | 32 | High閾値 |
| `LEVEL_LOW` | 11 | Low閾値 |
| `LEVEL_CRITICAL` | 3 | Critical閾値 |
| `STABILITY_STD_STABLE` | 1.0 | 安定判定（標準偏差） |
| `STABILITY_MOMENTUM_STABLE` | 0.5 | 安定判定（モメンタム） |
| `STABILITY_STD_UNSTABLE` | 2.5 | 不安定判定 |
| `CHANGE_TAG_THRESHOLD` | 6.0 | 変化大タグ閾値 |
| `CONSTANT_PERIOD_DAYS` | 183 | 不変期間閾値（6ヶ月） |
| `MID_MIN_RECORDS` | 3 | 中期指標計算の最小履歴数 |

### 5.5 バージョニング

- **spec_version**: v2.0（本書、2025-11-05更新）
- **主要変更**:
  - v1.0 → v2.0: シート構成変更（3シート→4シート）、monthly_trendsの役割拡張、エピソード指標のexpanding計算化、E_monthlyの削除

---

## 6. 実装参考

### 6.1 主要関数

- `add_multiscale_features()`: 多層時系列特徴量の計算
- `overwrite_short_mid_personal()`: 個人内強み/弱み判定
- `apply_personal_trend_logic()`: トレンド判定
- `compute_C_columns()`: 安定性・特性の計算
- `compute_monthly_metrics()`: 月次メトリクスの計算
- `compute_expanding_episode_distribution_metrics()`: エピソード・分布指標のexpanding計算
- `compute_final_episode_distribution_metrics()`: longterm用の最終値取得
- `build_shortterm()`: shorttermシート構築
- `build_longterm_master()`: longtermシート構築

### 6.2 関連ドキュメント

- `ANALYSIS_LOGIC.md`: 分析ロジックの詳細説明
- `decision_logic.md`: トレンド判定ロジックの詳細（日本語）
- `Inidividual Evaluation.md`: 評価手法の学術的背景

---

## 7. 使用方法

### 7.1 基本的な使い方

```bash
python3 build_we_playbook.py --input workengagement.xlsx --output we_playbook.xlsx
```

### 7.2 オプション

```bash
python3 build_we_playbook.py \
  --input workengagement.xlsx \
  --output we_playbook.xlsx \
  --mid-window 6  # 中期ウィンドウサイズ（デフォルト: 6）
```

### 7.3 出力例

```
✓ 完了: we_playbook.xlsx
  - shortterm: 最新Wave時点のメンバー短期状態（name カラムまで固定枠）
  - longterm: 個人の長期傾向・特性（name カラムまで固定枠、属性カラムなし）
  - monthly_trends: 全員×全Wave の月次時系列（個人分析用、属性カラムなし）
  - LatestIndividuals: 最新Waveのみ（monthly_trendsと同じ列構成）
```

---

## 8. 拡張・改善案

- **信頼区間**: `slope_3m` に対する簡易信頼性指標（データ点数・分散）の追加
- **Traitsの時間安定性**: 期間分割（前半/後半）で Long_trait の安定性を併記（ドリフト検出）
- **セクション比較**: 部門間のベンチマーク指標（現在は個人分析に特化）
- **予測機能**: 将来のEngagement推定（機械学習モデルの統合）
- **アラート機能**: リスク閾値を超えた際の自動通知
