# WE Analyzer 技術仕様書

**バージョン**: v4.1
**更新日**: 2025-12-21
**対象スクリプト**: `we_analyzer.py`
**出力ファイル**: `we_report.xlsx`

---

## 目次

1. [システム概要](#1-システム概要)
2. [主要定数定義](#2-主要定数定義)
3. [核心アルゴリズム](#3-核心アルゴリズム)
4. [指標定義と計算ロジック](#4-指標定義と計算ロジック)
5. [出力仕様](#5-出力仕様)
6. [実装仕様](#6-実装仕様)

---

## 1. システム概要

### 1.1 目的

本システムは、ワーク・エンゲージメント（WE）測定データから個人および組織の状態を多層的に分析し、時系列データと最新状態のスナップショットを提供する。UWES-9（Utrecht Work Engagement Scale）の測定結果を基に、トレンド分析、安定性評価、個人内強み/弱み判定、長期パターン分類を実施する。

### 1.2 出力構成

| シート名 | 目的 | 行粒度 |
|----------|------|--------|
| monthly_trends | 全員×全Waveの詳細時系列データ | 1人 × 1Wave |
| latest_individuals | 最新Waveのみの状態スナップショット | 1人 × 最新Wave |

### 1.3 入力データ要件

**必須列**
- `year` **かつ** `month`（整数）**または** `date`（日付）: Wave（YYYY-MM形式）生成に使用。少なくともどちらかの経路が必要。
- `name`: 表示名。`person`列が`mail_address`にフォールバックした場合でも必須。
- `mail_address`: 推奨される一意キー。存在しない場合は `name` が `person` に使用される。
- `section`: 所属部署。`group` が未入力の場合のフォールバック先にもなる。
- `group`: 所属グループ（任意）。空文字や`NaN`は`section`で補完。
- `vigor_rating`, `dedication_rating`, `absorption_rating`: 各UWES次元のスコア（0-18の整数値を想定）。

**任意列**
- `engagement_rating`: 直接入力された総合スコア。存在しない場合は `vigor + dedication + absorption`（最大54）で算出。

**計算される列**
- `wave`: `year/month` または `date` から生成される `YYYY-MM` 文字列。
- `person`: `mail_address` があればそれを使用、なければ `name` を採用。
- `group`: 空欄時は `section` で埋める（データ整形時に実施）。
- `engagement`: `engagement_rating` がなければ `vigor + dedication + absorption` を合計。

### 1.4 技術スタック

- **言語**: Python 3.8+
- **主要ライブラリ**:
  - pandas (データ処理)
  - numpy (数値計算)
  - xlsxwriter (Excel出力・書式設定)
- **統計手法**: Theil-Sen傾き推定、Robust Z-score、Rolling/Expanding統計

---

## 2. 主要定数定義

### 2.1 トレンド検出定数

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TREND_SLOPE` | 0.5 | `trend_base` が「上昇中」「低下中」になる際の6ヶ月傾き閾値（絶対値で利用）。 |
| `TREND_SLOPE_STD_MIN` | 0.2 | 傾き判定時に `E_slope_6_std_12` の絶対値がこの閾値を超えているかを確認し、微小傾きを除外。 |
| `TREND_SLOPE_STD` | 0.45 | 標準化傾きのみで「上昇中」「低下中」と判定する際の閾値（±0.45）。 |
| `TREND_DELTA_STRONG` | 5.0 | トレンド変化の強さを示す補助閾値（現行コードでは将来拡張用に保持）。 |
| `TREND_DELTA` | 1.0 | `E_delta_1` を用いた小幅変動判定および `E_sign_change_count_6m` のカウント対象閾値。 |
| `TREND_RECENT_DELTA` | 2.0 | `trend_recent` の上昇/下降/連続判定で使用する基本閾値。 |
| `CHANGE_TAG_THRESHOLD` | 6.0 | `trend_recent` の急上昇/急落、および組織基準「変化大」判定の閾値。 |
| `BIG_CHANGE_PERSONAL_Z` | 2.0 | `abs(E_delta_1) / E_std_12` がこの値を超えた場合に「変化大」とみなす。 |

**重要事項**: すべてのトレンド判定は厳密不等号（`>` / `<`）のみを使用し、境界値は含まない。

### 2.2 レベル分類定数

| 定数名 | 値 | 判定条件 |
|--------|-----|----------|
| `LEVEL_THRIVING` | 43 | Engagement > 43 |
| `LEVEL_HIGH` | 32 | 32 < Engagement ≤ 43 |
| `LEVEL_LOW` | 11 | 3 ≤ Engagement < 11 |
| `LEVEL_CRITICAL` | 3 | Engagement < 3 |

**level分類ロジック**
```python
if engagement > 43:
    "Thriving"
elif engagement > 32:
    "High"
elif engagement >= 11:
    "Moderate"
elif engagement >= 3:
    "Low"
else:
    "Critical"
```

### 2.3 安定性評価定数

**短期（6ヶ月）安定性**
| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_STD_STABLE` | 1.2 | E_std_6 < この値で「安定」（stability_midの判定に使用） |
| `STABILITY_MOMENTUM_STABLE` | 0.5 | \|E_momentum_3\| < この値で「安定」に寄与 |
| `STABILITY_STD_UNSTABLE` | 3.0 | E_std_6 > この値で「不安定」、および「変動中」判定に使用 |
| `STABILITY_RANGE_EPS` | 1e-6 | 不変判定の許容誤差 |

**長期（12ヶ月）安定性**
| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_STD_STABLE_LONG` | 1.5 | E_std_12 < この値で「持続安定」 |
| `STABILITY_MOMENTUM_STABLE_LONG` | 0.8 | \|E_momentum_6\| < この値で「持続安定」に寄与 |
| `STABILITY_STD_UNSTABLE_LONG` | 3.5 | E_std_12 > この値で「持続不安定」 |

### 2.4 特性分析定数

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `TRAIT_WINDOW_MONTHS` | 12 | 特性評価のローリングウィンドウ |
| `TRAIT_MIN_PERIODS` | 3 | 最小データ点数 |
| `SECTION_THRESHOLD` | 0.5 | セクション内Z-score閾値 |
| `TRAIT_MIN_HISTORY` | 6 | 特性評価に必要な最小履歴数 |
| `TRAIT_LEVEL_RATIO_MAX` | 0.8 | 短期履歴でのHigh/Low比率上限 |
| `TRAIT_LEVEL_RATIO_MIN` | 0.6 | 長期履歴でのHigh/Low比率下限 |
| `TRAIT_LEVEL_RATIO_DECAY` | 12 | 閾値緩和期間（月） |

### 2.5 slope3m_pattern定数

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `SLOPE_PATTERN_WINDOW` | 12 | 直近最大12ヶ月分の3ヶ月傾きを評価対象にする。 |
| `NET_RATIO_THRESHOLD` | 0.7 | 正/負傾きの割合がこの値を超えると「Net Growth/Decline」を検討。 |
| `SLOPE12_THRESHOLD` | 0.4 | `|E_slope_12|` がこの値を超えていなければ Net Growth/Decline にしない。 |
| `SLOPE6_STD12_THRESHOLD` | 0.2 | `|E_slope_6_std_12|` がこの値を超えていなければ Net Growth/Decline にしない。 |

### 2.6 その他の定数

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `SHORT_WINDOW_MONTHS` | 3 | 3ヶ月平均・モメンタム・3ヶ月傾きの標準ウィンドウ。 |
| `MID_WINDOW_MONTHS` | 6 | 中期傾き・モメンタム・安定性の標準ウィンドウ。 |
| `LONG_WINDOW_MONTHS` | 12 | 長期統計（標準偏差、安定性）のウィンドウ。 |
| `MID_MIN_RECORDS` | 3 | `trend_base` 判定に必要な最小レコード数。 |
| `TRAIT_MIN_HISTORY` | 6 | 特性強み・弱み判定を開始するために必要な履歴数。 |
| `LOW_EPISODE_THRESHOLD` | 2 | 低レベル連続月数の閾値。 |
| `SHORT_VDA_MIN_DELTA` | 2.0 | 個人内V/D/A短期強み判定で要求する最小Δ。 |
| `MIN_SLOPE` | 0.20 | V/D/A中期強み判定で要求する最小傾き（絶対値）。 |
| `Z_VDA_THRESHOLD` | 0.8 | セクション内Z-scoreの強み/弱み判定で使用。 |

---

## 3. 核心アルゴリズム

### 3.1 Theil-Sen傾き推定

**目的**: 外れ値に頑健な傾き推定

**アルゴリズム**:
```python
def _theil_sen_slope_window(y, max_len):
    """
    最大max_len個の直近データポイントからTheil-Sen傾きを推定

    特殊ケース:
    - n < 3: 線形傾き (y[-1] - y[0]) / (n - 1)
    - 3 ≤ n < 6: 線形傾き (短期データへの配慮)
    - n ≥ 6: 全ペア間傾きの中央値
    """
    # 有限値のみ抽出
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]

    if len(arr) == 0:
        return 0.0

    # 最新max_len個に制限
    if len(arr) > max_len:
        arr = arr[-max_len:]

    n = len(arr)

    # n < 3: 線形傾き
    if n < 3:
        return float((arr[-1] - arr[0]) / (n - 1)) if n >= 2 else 0.0

    # 3 ≤ n < 6: 線形傾き（短期データ）
    if n < 6:
        return float((arr[-1] - arr[0]) / (n - 1))

    # n ≥ 6: 全ペア間傾きの中央値
    slopes = []
    for i in range(n - 1):
        for j in range(i + 1, n):
            slopes.append((arr[j] - arr[i]) / (j - i))

    return float(np.median(slopes)) if slopes else 0.0
```

**使用箇所**:
- `E_slope_6`: 6ヶ月のTheil-Sen傾き。
- `E_slope_12`: 12ヶ月のTheil-Sen傾き。
- `V_slope_6`, `D_slope_6`, `A_slope_6`: V/D/A各次元の6ヶ月傾き。
- `E_slope_6_std_12`: 上記 `E_slope_6` を12ヶ月標準偏差で割って正規化。

### 3.2 Expanding Robust Z-score（現在値除外版）

**目的**: 累積データに基づく個人内標準化

**アルゴリズム**:
```python
def expanding_robust_z_exclusive(series, eps=1e-9):
    """
    累積中央値とMAD(=1.4826 * median(|x - median|))を使用し、
    現在値を除外したRobust Z-scoreを算出する。
    """
    med = series.expanding(min_periods=1).median().shift(1)
    abs_dev = (series - med).abs()
    mad = 1.4826 * abs_dev.expanding(min_periods=1).median().shift(1)

    z = (series - med) / mad
    z[(mad.isna()) | (mad < eps)] = np.nan
    return z
```

**使用箇所**:
- セクション内Z-score計算（vigor_z, dedication_z, absorption_z, engagement_z）
- 個人内変動の標準化

### 3.3 符号変化カウント（E_sign_change_count_6m）

**目的**: 直近6ヶ月のE_delta_1符号変化回数をカウントし、変動の激しさを検出

**アルゴリズム**:
```python
def count_sign_changes(engagement_series, window=6, threshold=1.0):
    """
    直近window月のE_delta_1符号変化回数をカウント

    符号変化条件:
    - 連続する2つのE_delta_1の両方が|E_delta_1| > thresholdを満たす
    - かつ、符号が正→負または負→正に変化

    Parameters:
    - engagement_series: エンゲージメント時系列（古→新）
    - window: カウント対象ウィンドウ（デフォルト6ヶ月）
    - threshold: カウント対象とする最小|E_delta_1|（デフォルト1.0）

    Returns:
    - sign_changes: 符号変化回数（整数）
    """
    e = engagement_series[-window:]  # 直近window個

    if len(e) < 2:
        return 0

    # E_delta_1を計算
    deltas = []
    for i in range(1, len(e)):
        deltas.append(e[i] - e[i-1])

    # 符号変化をカウント
    sign_changes = 0
    for i in range(1, len(deltas)):
        prev_delta = deltas[i-1]
        curr_delta = deltas[i]

        # 両方が閾値を超え、かつ符号が異なる場合
        if (abs(prev_delta) > threshold and
            abs(curr_delta) > threshold and
            ((prev_delta > 0 and curr_delta < 0) or
             (prev_delta < 0 and curr_delta > 0))):
            sign_changes += 1

    return sign_changes
```

**重要な特徴**:
- 微小な変化（|E_delta_1| ≤ threshold）は無視し、ノイズを除去
- 符号変化が多い = 上昇と下降を繰り返す不安定な状態
- 「変動中」判定（E_sign_change_count_6m > 2.0 かつ E_std_6 > 3.0）に使用

**使用箇所**:
- trend_baseの「変動中」判定
- 月次トレンドデータの補助指標

### 3.4 レベルバンド化

**目的**: 連続値のエンゲージメントを3段階（High/Mid/Low）に分類

**アルゴリズム**:
```python
def bandify_level(level_str):
    """
    level文字列をHigh/Mid/Lowに変換

    High: "Thriving", "High"
    Mid: "Moderate"
    Low: "Low", "Critical"
    """
    if level_str in ("Thriving", "High"):
        return "High"
    elif level_str == "Moderate":
        return "Mid"
    elif level_str in ("Low", "Critical"):
        return "Low"
    else:
        return "Other"
```

**使用箇所**:
- エピソード指標計算（回復・下降エピソード）
- レベル分布計算（pct_high, pct_mid, pct_low）

---

## 4. 指標定義と計算ロジック

### 4.1 基本統計指標

#### 4.1.1 差分・変化量

| 指標名 | 定義 | 計算方法 |
|--------|------|----------|
| `E_delta_1` | 直近1ヶ月の変化量 | `engagement[t] - engagement[t-1]` |
| `E_delta_1_prev` | 1つ前の月次変化量 | `engagement[t-1] - engagement[t-2]` |
| `E_sign_change_count_6m` | 直近6ヶ月の符号変化回数 | E_delta_1の符号が正→負または負→正に変化した回数（\|E_delta_1\| > TREND_DELTA の場合のみカウント） |
| `E_delta_1_std_12` | 標準化月次変化量 | `E_delta_1 / E_std_12`（E_std_12 > 0の場合） |
| `V_delta_1` | vigor直近1ヶ月変化 | `vigor[t] - vigor[t-1]` |
| `D_delta_1` | dedication直近1ヶ月変化 | `dedication[t] - dedication[t-1]` |
| `A_delta_1` | absorption直近1ヶ月変化 | `absorption[t] - absorption[t-1]` |

#### 4.1.2 平均値

| 指標名 | 定義 | ウィンドウ |
|--------|------|-----------|
| `E_mean_3` | 3ヶ月移動平均 | rolling(3, min_periods=1).mean() |
| `E_mean_6` | 6ヶ月移動平均 | rolling(6, min_periods=1).mean() |

#### 4.1.3 標準偏差

| 指標名 | 定義 | ウィンドウ |
|--------|------|-----------|
| `E_std_6` | 6ヶ月標準偏差 | rolling(6, min_periods=1).std() |
| `E_std_12` | 12ヶ月標準偏差 | rolling(12, min_periods=1).std() |
| `E_std_18` | 18ヶ月標準偏差 | rolling(18, min_periods=1).std() |

#### 4.1.4 四分位範囲

| 指標名 | 定義 | ウィンドウ |
|--------|------|-----------|
| `E_iqr_6` | 6ヶ月IQR | `Q3_6 - Q1_6` |

#### 4.1.5 モメンタム

| 指標名 | 定義 | 計算方法 |
|--------|------|----------|
| `E_momentum_3` | 直近3ヶ月平均と直前の3ヶ月平均の差 | `mean(E[-3:]) - mean(E[-6:-3])`（履歴が6未満の場合は「それ以前の全期間平均」を使用） |
| `E_momentum_6` | 直近6ヶ月平均とその前6ヶ月平均の差 | `mean(E[-6:]) - mean(E[-12:-6])`（履歴が12未満の場合は既存データで代替） |

### 4.2 傾き指標

すべての傾き指標はTheil-Sen推定を使用。

| 指標名 | 定義 | ウィンドウ | 計算関数 |
|--------|------|-----------|----------|
| `E_slope_6` | 6ヶ月傾き | 6 | `_theil_sen_slope_window(y, 6)` |
| `E_slope_12` | 12ヶ月傾き | 12 | `_theil_sen_slope_window(y, 12)` |
| `E_slope_6_std_12` | 正規化6ヶ月傾き | - | `E_slope_6 / E_std_12`（E_std_12 > 0の場合） |
| `V_slope_6` | vigor 6ヶ月傾き | 6 | `_theil_sen_slope_window(V, 6)` |
| `D_slope_6` | dedication 6ヶ月傾き | 6 | `_theil_sen_slope_window(D, 6)` |
| `A_slope_6` | absorption 6ヶ月傾き | 6 | `_theil_sen_slope_window(A, 6)` |

**補足**:
- `E_slope_6_std_12` は変動幅を正規化した傾きを提供し、`trend_base` 判定の主指標となる。
- `slope3m_pattern` では `_rolling_linear_slope`（ウィンドウ3）を個別に計算し、Theil-Senではなく線形回帰傾きを用いる。

### 4.3 傾き派生指標

#### 4.3.1 E_accel_6（6ヶ月傾きの加速度）

- **定義**: 直近の `E_slope_6` と1ヶ月前の `E_slope_6` の差分。
- **役割**: 傾きの変化速度を把握し、急激なトレンド変化を検知する補助指標。
- **計算**:
  ```python
  if np.isfinite(prev_slope6) and np.isfinite(current_slope6):
      E_accel_6 = current_slope6 - prev_slope6
  else:
      E_accel_6 = 0.0
  ```

#### 4.3.2 Prev_E_slope_6（1ヶ月前の6ヶ月傾き）

- **定義**: 1ヶ月前時点での `E_slope_6` を保持した参照値。初期値は現在の `E_slope_6`。
- **用途**: `E_accel_6` 計算のために保持し、必要に応じて分析上の参考情報にも利用できる。

### 4.4 トレンド指標

#### 4.4.1 trend_base（中期トレンド基本判定）

**目的**: 6ヶ月傾きと正規化傾きに基づく中期トレンドの基本分類、および高頻度変動の検出

**出力**: `"上昇中"`, `"低下中"`, `"安定"`, `"変動中"`, `"未評価"`

**計算ロジック**:

```python
# 初期化
base = "安定"  # すべてのレコードのデフォルト

# 履歴不足判定
has_mid_history = 個人のレコード数 >= MID_MIN_RECORDS  # 3件未満は未評価
if not has_mid_history:
    base = "未評価"

# 上昇中判定（いずれかの条件）
if (
    (slope > TREND_SLOPE and slope_std > TREND_SLOPE_STD_MIN)
    OR
    (slope_std > TREND_SLOPE_STD)
):
    base = "上昇中"

# 低下中判定（いずれかの条件）
if (
    (slope < -TREND_SLOPE and slope_std < -TREND_SLOPE_STD_MIN)
    OR
    (slope_std < -TREND_SLOPE_STD)
):
    base = "低下中"

# 変動中判定（高頻度の符号変化 + 高ボラティリティ）
# 上昇中・低下中よりも優先（最後に判定して上書き）
if (
    has_mid_history
    AND E_sign_change_count_6m > TREND_RECENT_DELTA  # 2.0
    AND E_std_6 > STABILITY_STD_UNSTABLE  # 3.0
):
    base = "変動中"
```

**判定条件詳細**:

1. **上昇中**:
   - 条件A: `E_slope_6 > 0.5` **かつ** `E_slope_6_std_12 > 0.2`
   - 条件B: `E_slope_6_std_12 > 0.45`
   - いずれかが成立すれば「上昇中」

2. **低下中**:
   - 条件A: `E_slope_6 < -0.5` **かつ** `E_slope_6_std_12 < -0.2`
   - 条件B: `E_slope_6_std_12 < -0.45`
   - いずれかが成立すれば「低下中」

3. **変動中**（最優先）:
   - `E_sign_change_count_6m > 2.0` **かつ** `E_std_6 > 3.0`
   - 符号が頻繁に変化し、かつボラティリティが高い状態
   - 上昇中・低下中判定を上書き

4. **安定**: 上昇中でも低下中でも変動中でもない状態

5. **未評価**: データ点数 < 3

#### 4.4.2 trend_recent（短期トレンド）

**目的**: 直近1ヶ月の変化量（E_delta_1）に基づく短期トレンド分類

**出力**: `"連続上昇"`, `"急上昇"`, `"上昇"`, `"横ばい"`, `"下降"`, `"急落"`, `"連続下降"`

**計算ロジック**:

```python
# 閾値
recent_thr = TREND_RECENT_DELTA  # 2.0
acute_thr = CHANGE_TAG_THRESHOLD  # 6.0

# 現在と前回の変化を取得
delta = E_delta_1[t]
delta_prev = E_delta_1_prev[t]

# 初期値
trend = "横ばい"

# ステップ1: 中程度の変化
if recent_thr < delta < acute_thr:
    trend = "上昇"
if -acute_thr < delta < -recent_thr:
    trend = "下降"

# ステップ2: 急激な変化（上書き）
if delta >= CHANGE_TAG_THRESHOLD:
    trend = "急上昇"
if delta <= -CHANGE_TAG_THRESHOLD:
    trend = "急落"

# ステップ3: 連続変化（最優先で上書き）
if delta > recent_thr and delta_prev > recent_thr:
    trend = "連続上昇"
if delta < -recent_thr and delta_prev < -recent_thr:
    trend = "連続下降"
```

**優先順位** (高→低):
1. 連続上昇/連続下降
2. 急上昇/急落
3. 上昇/下降
4. 横ばい

**判定条件**:
- `連続上昇`: `delta > 2.0` **かつ** `delta_prev > 2.0`
- `急上昇`: `delta ≥ 6.0`
- `上昇`: `2.0 < delta < 6.0`
- `横ばい`: `-2.0 ≤ delta ≤ 2.0`
- `下降`: `-6.0 < delta < -2.0`
- `急落`: `delta ≤ -6.0`
- `連続下降`: `delta < -2.0` **かつ** `delta_prev < -2.0`

#### 4.4.3 trend_refined（統合トレンド）

**目的**: `trend_base`（中期）、`trend_recent`（短期）、`change_tag`（個人内変化大判定）、`E_slope_6` などを統合し、状況を21カテゴリーで表現する。

**出力候補（21種類）**  
`入力疑義 / 変動中上昇 / 変動中低下 / 変動中安定 / 変動中 / 上昇加速 / 低下加速 / 上昇継続 / 低下継続 / 復活 / 悪化 / 回復 / 低下危機 / 上昇期待 / 低下警戒 / 低下懸念 / 回復期待 / 上昇 / 下降 / 安定 / 安定維持`

> `横ばい` は `trend_base == "未評価"` かつ `trend_recent == "横ばい"` のときのみ返される。`trend_base == "安定"` で横ばいの場合は必ず `"安定維持"`。

**補助定義**
- `change_tag`: `abs(E_delta_1) / E_std_12 > BIG_CHANGE_PERSONAL_Z` のとき `"変化大"`、それ以外は `"not 変化大"`。
- `up_trends = ["上昇", "急上昇", "連続上昇"]`
- `down_trends = ["下降", "急落", "連続下降"]`
- `abs(E_slope_6) > TREND_SLOPE` を満たすときのみ加速/継続系の判定を許可（標準化傾きのみで判定されたケースの安全装置）。

**実際の優先順位（コード順）**

1. **入力疑義**: `flag_constant_6m` が TRUE → `入力疑義`
2. **変動中**: `trend_base == "変動中"`
   - `trend_recent` ∈ up_trends → `変動中上昇`
   - `trend_recent` ∈ down_trends → `変動中低下`
   - `trend_recent == "横ばい"` → `変動中安定`
   - その他 → `変動中`
3. **加速系**（傾きと短期が同方向 & `change_tag == "変化大"` & `abs(E_slope_6) > 0.5`）
   - 上昇側 → `上昇加速`
   - 低下側 → `低下加速`
4. **継続系**（傾きと短期が同方向 & `change_tag == "not 変化大"` & `abs(E_slope_6) > 0.5`）
   - `trend_base == "上昇中"` & `E_delta_1 >= 0` → `上昇継続`
   - `trend_base == "低下中"` & `E_delta_1 <= 0` → `低下継続`
5. **大きな反転**（`change_tag == "変化大"`）
   - `trend_base == "低下中"` + 短期が上向き → `復活`
   - `trend_base == "上昇中"` + 短期が下向き → `悪化`
6. **小さな反転**（`change_tag == "not 変化大"`）
   - `trend_base == "低下中"` + 短期が上向き → `回復`
   - `trend_base == "上昇中"` + 短期が下向き → `低下危機`
7. **安定ベースの期待/警戒** (`trend_base == "安定"`)
   - 短期が上向き → `上昇期待`
   - 短期が下向き → `低下警戒`
8. **横ばい時の注意喚起** （基準は「変動中」ではなく「上昇中/低下中」）
   - `trend_base == "上昇中"` かつ `trend_recent == "横ばい"` で `E_delta_1 < 0` → `低下懸念`
   - `trend_base == "低下中"` かつ `trend_recent == "横ばい"` で `E_delta_1 > 0` → `回復期待`
9. **未評価の単純化**
   - `trend_recent` ∈ {"上昇","急上昇"} → `上昇`
   - `trend_recent` ∈ {"下降","急落"} → `下降`
   - `trend_recent == "横ばい"` → `横ばい`
10. **安定維持 / フォールバック**
    - `trend_base == "安定"` かつ `trend_recent == "横ばい"` → `安定維持`
    - (同条件で `change_tag == "not 変化大"` のチェックをもう一度行う)
    - 上記すべてに該当しなければ最終的に `安定維持`

この順で評価することで、スクリプトと同じ 21 カテゴリーが常に一意に決まる。

**視覚化：`trend_base × trend_recent` マトリクス**

| trend_base \\ trend_recent | 上方向（上昇 / 急上昇 / 連続上昇） | 横ばい | 下方向（下降 / 急落 / 連続下降） |
|---------------------------|-------------------------------------|--------|-----------------------------------|
| 変動中 | 変動中上昇 | 変動中安定 | 変動中低下 |
| 上昇中 | 上昇加速（変化大・\|E_slope_6\|>0.5）<br>上昇継続（not変化大・ΔE≥0・\|E_slope_6\|>0.5） | 上昇継続（ΔE≥0・\|E_slope_6\|>0.5）<br>低下懸念（ΔE<0） | 悪化（変化大・\|E_slope_6\|>0.5）<br>低下危機（not変化大） |
| 低下中 | 回復（not変化大）<br>復活（変化大・\|E_slope_6\|>0.5） | 回復期待（ΔE>0）<br>低下継続（ΔE≤0・\|E_slope_6\|>0.5） | 低下加速（変化大・\|E_slope_6\|>0.5）<br>低下継続（not変化大・ΔE≤0・\|E_slope_6\|>0.5） |
| 安定 | 上昇期待 | 安定維持 | 低下警戒 |
| 未評価 | 上昇 | 安定 | 下降 |

**補足**
- `変化大` は `abs(E_delta_1) / E_std_12 > BIG_CHANGE_PERSONAL_Z` を意味する。
- `|E_slope_6| > TREND_SLOPE (0.5)` は加速・継続・復活・悪化系の前提条件。
- `ΔE` は `E_delta_1`。符号条件を満たさない場合は該当カテゴリにならない（例: ΔE<0 でないと `低下懸念` にならない）。
- `trend_base == "変動中"` の場合、短期トレンドに応じて `変動中○○` に振り分けられる。
- 上記のどのセルにも該当しない場合はフォールバックとして `安定維持` が返る。

### 4.5 変化フラグ

#### 4.5.1 big_change（個人基準変化大）

**定義**: 個人内標準偏差の2倍以上の変化

**計算**:
```python
if E_std_12 > 0 and abs(E_delta_1) / E_std_12 > 2.0:
    big_change = "変化大"
else:
    big_change = ""
```

**意味**: 個人の過去12ヶ月の変動幅に対して今月の変化が2σを超える場合に「変化大」と見なす（`trend_refined` の `change_tag` と共有）。

#### 4.5.2 big_change_abs（組織基準変化大）

**定義**: 絶対値で6点以上の変化

**計算**:
```python
if abs(E_delta_1) >= 6.0:
    big_change_abs = "変化大"
else:
    big_change_abs = ""
```

**意味**: 組織全体の基準から見て、今月の変化が大きい

### 4.6 安定性指標

#### 4.6.1 stability_6（短期安定性）

**目的**: 直近6ヶ月の変動パターンから安定性を評価

**出力**: `""`（履歴不足）、`"不変"`, `"安定"`, `"やや安定"`, `"不安定"`

**計算ロジック**:

```python
# Step 1: 履歴チェック
if 過去6ヶ月のレコード数 < MID_WINDOW_MONTHS:  # 6
    return ""

# Step 2: 不変チェック（V/D/A/Eすべてが6ヶ月間一定）
if max(E[-6:]) - min(E[-6:]) < STABILITY_RANGE_EPS and
   max(V[-6:]) - min(V[-6:]) < STABILITY_RANGE_EPS and
   ... (D/Aも同様):
    return "不変"

# Step 3: 標準偏差とモメンタムによる判定
std_6 = E_std_6
mom_3 = abs(E_momentum_3)

if std_6 < STABILITY_STD_STABLE and mom_3 < STABILITY_MOMENTUM_STABLE:
    return "安定"
if std_6 > STABILITY_STD_UNSTABLE:
    return "不安定"
return "やや安定"
```

**判定基準**:
- `不変`: V/D/A/Eの6ヶ月レンジすべてが `STABILITY_RANGE_EPS` 未満
- `安定`: `E_std_6 < 1.2` **かつ** `|E_momentum_3| < 0.5`
- `不安定`: `E_std_6 > 3.0`
- `やや安定`: 上記いずれにも該当しない

#### 4.6.2 stability_12（長期安定性）

**目的**: 直近12ヶ月の変動パターンから長期的安定性を評価

**出力**: `"持続安定"`, `"やや持続安定"`, `"持続不安定"`, `"完全不変"`

**計算ロジック**:

```python
# Step 1: 履歴チェック
if 過去12ヶ月のレコード数 < LONG_WINDOW_MONTHS:  # 12
    return ""

# Step 2: 完全不変チェック（12ヶ月レンジ ≈ 0）
range_12 = E_max_12 - E_min_12
if range_12 < STABILITY_RANGE_EPS:
    return "完全不変"

# Step 3: 標準偏差とモメンタムによる判定
std_12 = E_std_12
mom_6 = abs(E_momentum_6)

# 持続安定
if std_12 < STABILITY_STD_STABLE_LONG and mom_6 < STABILITY_MOMENTUM_STABLE_LONG:
    return "持続安定"

# 持続不安定
if std_12 > STABILITY_STD_UNSTABLE_LONG:  # 3.5
    return "持続不安定"

# やや持続安定（中間）
return "やや持続安定"
```

**判定基準**:
- `完全不変`: V/D/A/Eの12ヶ月レンジすべてが `STABILITY_RANGE_EPS` 未満
- `持続安定`: `E_std_12 < 1.5` **かつ** `|E_momentum_6| < 0.8`
- `持続不安定`: `E_std_12 > 3.5`
- `やや持続安定`: 上記いずれにも該当しない

### 4.7 個人内強み/弱み指標

#### 4.7.1 short_strength / short_weakness（短期強み/弱み）

**目的**: 直近3ヶ月の個人内V/D/A相対値から短期的な強み/弱みを判定

**出力**: `"V"`, `"D"`, `"A"`, または空文字列

**計算ロジック**:

```python
# Step 1: 履歴チェック
if 過去3ヶ月のレコード数 < SHORT_MIN_RECORDS:
    return ("", "")

# Step 2: 直近3ヶ月の平均を計算
V_mean_3 = vigor[-3:].mean()
D_mean_3 = dedication[-3:].mean()
A_mean_3 = absorption[-3:].mean()

# Step 3: 最大・最小次元を特定
scores = {"V": V_mean_3, "D": D_mean_3, "A": A_mean_3}
max_dim = max(scores, key=scores.get)
min_dim = min(scores, key=scores.get)

# Step 4: 差分チェック（有意な差があるか）
max_val = scores[max_dim]
min_val = scores[min_dim]

if max_val - min_val > 0:  # 差があれば判定
    strength = max_dim
    weakness = min_dim
else:
    strength = ""
    weakness = ""

return (strength, weakness)
```

**注意事項**:
- 3つの次元間の平均値を比較
- 最大と最小の差があれば判定（閾値0）
- 差が小さい場合は空文字列（判定保留）

#### 4.7.2 mid_strength / mid_weakness（中期強み/弱み）

**目的**: 直近6ヶ月の傾き（slope_6）から中期的な強み/弱みを判定

**出力**: `"V"`, `"D"`, `"A"`, または空文字列

**計算ロジック**:

```python
# Step 1: 履歴チェック
if 過去6ヶ月のレコード数 <= MID_MIN_RECORDS:
    return ("", "")

# Step 2: 各次元の6ヶ月傾きを計算
V_slope_6 = _theil_sen_slope_window(vigor[-6:], 6)
D_slope_6 = _theil_sen_slope_window(dedication[-6:], 6)
A_slope_6 = _theil_sen_slope_window(absorption[-6:], 6)

# Step 3: 最大・最小次元を特定
slopes = {"V": V_slope_6, "D": D_slope_6, "A": A_slope_6}
max_dim = max(slopes, key=slopes.get)
min_dim = min(slopes, key=slopes.get)

# Step 4: 傾きの絶対値チェック（有意な傾きがあるか）
max_val = slopes[max_dim]
min_val = slopes[min_dim]

if max_val - min_val > 0:  # 差があれば判定
    strength = max_dim
    weakness = min_dim
else:
    strength = ""
    weakness = ""

return (strength, weakness)
```

**注意事項**:
- 3つの次元の傾き（slope）を比較
- 最大と最小の差があれば判定（閾値0）
- 傾きがない（差が小さい）場合は空文字列

### 4.8 特性強み/弱み指標

#### 4.8.1 trait_strength / trait_weakness

**目的**: 長期的（累積データ）に見て、セクション内相対位置で一貫して高い/低い次元を特定

**出力**: `"V"`, `"D"`, `"A"`, または空文字列

**前提条件**:
1. 累積データ（Expanding）で評価
2. セクション内Z-scoreを使用
3. レベルバンド（High/Mid/Low）による履歴フィルタリング

**計算ロジック**:

```python
# Step 1: 各Wave時点でのレベルバンドと履歴カウント
level_band = bandify_level(level)  # "High", "Mid", "Low"
history_count = expanding().count()  # 累積レコード数

# Step 2: セクション内Z-scoreによる次元別カウント
# （Expanding: 各時点で過去全てのデータを使用）
for each wave:
    if vigor_z > SECTION_THRESHOLD:  # 0.5
        V_count_high += 1
    if vigor_z < -SECTION_THRESHOLD:
        V_count_low += 1

    # 同様にD, Aもカウント

# Step 3: High/Low比率による評価可否判定
# 動的閾値: 履歴が少ない間は厳しく、増えるにつれ緩和
ratio_threshold = TRAIT_LEVEL_RATIO_MAX - (
    (TRAIT_LEVEL_RATIO_MAX - TRAIT_LEVEL_RATIO_MIN) *
    min(history_count, TRAIT_LEVEL_RATIO_DECAY) / TRAIT_LEVEL_RATIO_DECAY
)

# 例: history=6 → 0.8, history=12 → 0.7, history≥12 → 0.6

# Step 4: 特性評価可能性チェック
is_evaluable = (
    history_count >= TRAIT_MIN_HISTORY  # 6
    and pct_high < ratio_threshold
    and pct_low < ratio_threshold
)

if not is_evaluable:
    return ("", "")

# Step 5: 最頻出次元の抽出
dimensions = ["V", "D", "A"]
high_counts = [V_count_high, D_count_high, A_count_high]
low_counts = [V_count_low, D_count_low, A_count_low]

max_high_idx = argmax(high_counts)
max_low_idx = argmax(low_counts)

# 同点の場合は空文字列
if high_counts.count(high_counts[max_high_idx]) > 1:
    strength = ""
else:
    strength = dimensions[max_high_idx]

if low_counts.count(low_counts[max_low_idx]) > 1:
    weakness = ""
else:
    weakness = dimensions[max_low_idx]

return (strength, weakness)
```

**重要な特徴**:
- **Expanding計算**: 各Wave時点で過去全データを使用
- **動的閾値**: 履歴が増えるにつれ評価基準を緩和
- **レベル偏り除外**: High/Lowレベルに偏った人は特性評価しない
- **同点処理**: 複数次元が同点の場合は判定保留

#### 4.8.2 trait_strength_conf_V/D/A, trait_weakness_conf_V/D/A

**目的**: 各次元の特性強み/弱みとしての支持率（信頼度）を数値化

**出力**: 0.0～1.0の浮動小数点数

**計算ロジック**:

```python
# Expanding計算で各Wave時点までの支持率を算出

for each wave:
    # 累積カウント
    total_evaluable = これまでの評価可能Wave数

    # 各次元の支持回数
    V_strength_support = trait_strength == "V" だったWave数
    V_weakness_support = trait_weakness == "V" だったWave数

    # 支持率
    if total_evaluable > 0:
        trait_strength_conf_V = V_strength_support / total_evaluable
        trait_weakness_conf_V = V_weakness_support / total_evaluable
    else:
        trait_strength_conf_V = 0.0
        trait_weakness_conf_V = 0.0
```

**意味**:
- 例: `trait_strength_conf_V = 0.75` → これまでの評価可能Wave のうち75%で Vが強みと判定された
- 値が高いほど、その次元が一貫して強み/弱みであることを示す

### 4.9 エピソード指標（Expanding）

すべてのエピソード指標は累積（Expanding）計算。

#### 4.9.1 episodes_recovery（回復エピソード数）

**定義**: Low → Mid以上への上昇回数

**計算**:
```python
for each wave (累積):
    if 前回level_band == "Low" and 今回level_band in ("Mid", "High"):
        episodes_recovery += 1
```

#### 4.9.2 episodes_fall（下降エピソード数）

**定義**: Mid以上 → Lowへの下降回数

**計算**:
```python
for each wave (累積):
    if 前回level_band in ("Mid", "High") and 今回level_band == "Low":
        episodes_fall += 1
```

#### 4.9.3 recovery_rate（回復率）

**定義**: 回復エピソード数 / 累積レコード数

**計算**:
```python
recovery_rate = episodes_recovery / expanding().count()
```

#### 4.9.4 fall_rate（下降率）

**定義**: 下降エピソード数 / 累積レコード数

**計算**:
```python
fall_rate = episodes_fall / expanding().count()
```

#### 4.9.5 episodes_low2plus（Low脱出回数）

**定義**: Lowレベルから脱出した回数

**計算**:
```python
for each wave (累積):
    if 前回level_band == "Low" and 今回level_band != "Low":
        episodes_low2plus += 1
```

#### 4.9.6 low_streak_max（Low連続期間最大値）

**定義**: Lowレベルが連続した最大期間（月数）

**計算**:
```python
current_streak = 0
max_streak = 0

for each wave (累積):
    if level_band == "Low":
        current_streak += 1
        max_streak = max(max_streak, current_streak)
    else:
        current_streak = 0

low_streak_max = max_streak
```

### 4.10 レベル分布指標（Expanding）

#### 4.10.1 pct_high, pct_mid, pct_low

**定義**: 各レベルバンドの累積出現率

**計算**:
```python
# 各Wave時点までの累積
total_count = expanding().count()
high_count = (level_band == "High").expanding().sum()
mid_count = (level_band == "Mid").expanding().sum()
low_count = (level_band == "Low").expanding().sum()

pct_high = high_count / total_count
pct_mid = mid_count / total_count
pct_low = low_count / total_count
```

### 4.11 slope3m_pattern（長期推移パターン）

**目的**: 直近12ヶ月のE_slope_3m系列から、長期的な変化パターンを分類

**出力**: `"Net Growth"`, `"Net Decline"`, `"U-Shape"`, `"Inverted-U"`, `"Oscillating"`, `"Flat/Noisy"`, `"Insufficient"`

**計算単位**: 個人ごとに1つ（最新Wave時点のみ）

> **Note**: `E_slope_3m` は出力列として保持しておらず、`compute_slope3m_pattern` 内で `_rolling_linear_slope(engagement, window=3)` を使って直近値を都度算出する。

**アルゴリズム**:

```python
def classify_slope3m_pattern(person_data):
    """
    person_data: 個人の時系列（engagement列を含む）
    """

    slope_series = _rolling_linear_slope(person_data["engagement"], SHORT_WINDOW_MONTHS)
    e_slope_3m_seq = slope_series.tail(SLOPE_PATTERN_WINDOW).tolist()

    # 有効値のみ抽出
    valid_slopes = [x for x in e_slope_3m_seq if pd.notna(x)]
    N = len(valid_slopes)

    # === Step 1: Insufficient ===
    if N <= 3:
        return "Insufficient"

    # 基本統計
    r_pos = (正のslope数) / N
    r_neg = (負のslope数) / N
    mean_3m = valid_slopes の平均
    flips = sign変化回数（0を除く）
    front_mean = 前半平均
    back_mean = 後半平均
    first3 = 最初の3個（最大）
    last3 = 最後の3個（最大）

    # === Step 2: Net Growth / Net Decline ===
    # 長期傾きと正規化傾きによる検証を追加

    e_slope_12 = person_data.iloc[-1]["E_slope_12"]
    e_slope_6_std_12 = person_data.iloc[-1]["E_slope_6_std_12"]
    if pd.notna(e_slope_12) and pd.notna(e_slope_6_std_12):
        # Net Growth条件
        if (
            r_pos >= 0.7
            and mean_3m > 0
            and abs(e_slope_12) > 0.4
            and abs(e_slope_6_std_12) > 0.2
        ):
            return "Net Growth"

        # Net Decline条件
        if (
            r_neg >= 0.7
            and mean_3m < 0
            and abs(e_slope_12) > 0.4
            and abs(e_slope_6_std_12) > 0.2
        ):
            return "Net Decline"

    # === Step 3: U-Shape / Inverted-U ===
    if first3 and last3:
        neg_first = first3中の負の個数
        pos_first = first3中の正の個数
        neg_last = last3中の負の個数
        pos_last = last3中の正の個数

        # U-Shape
        if (
            front_mean < 0
            and back_mean > 0
            and neg_first >= 2
            and pos_last >= 2
        ):
            return "U-Shape"

        # Inverted-U
        if (
            front_mean > 0
            and back_mean < 0
            and pos_first >= 2
            and neg_last >= 2
        ):
            return "Inverted-U"

    # === Step 4: Oscillating ===
    if flips >= 3:
        return "Oscillating"

    # === Step 5: Flat/Noisy ===
    return "Flat/Noisy"
```

**優先順位**:
1. Insufficient（N ≤ 3）
2. Net Growth / Net Decline（長期傾き検証あり）
3. U-Shape / Inverted-U（形状パターン）
4. Oscillating（変動が多い）
5. Flat/Noisy（その他）

**重要な更新点**:
- Net Growth/Decline判定に`E_slope_12`と`E_slope_6_std_12`による検証を追加
- これにより、短期的な偏りではなく、中長期的な一貫性を要求

#### 4.11.1 r_pos / r_neg（正負比率）

**目的**: slope3m_pattern計算の補助指標として、直近12ヶ月のE_slope_3m正負比率を各Wave時点で計算

**出力**: 0.0～1.0の浮動小数点数

**計算ロジック**:

```python
# 各個人・各Wave時点で計算
for each person, wave:
    # 直近最大12ヶ月の3ヶ月傾きを計算
    slopes = _rolling_linear_slope(person_wave_data["engagement"], SHORT_WINDOW_MONTHS)
    window_slopes = slopes[max(0, i-11):i+1].dropna()

    if len(window_slopes) > 0:
        r_pos = (window_slopes > 0).sum() / len(window_slopes)
        r_neg = (window_slopes < 0).sum() / len(window_slopes)
    else:
        r_pos = NaN
        r_neg = NaN
```

**使用箇所**:
- slope3m_pattern分類の補助情報
- 月次トレンドシートでの可視化

### 4.12 flag_constant_6m（入力妥当性フラグ）

**目的**: V/D/Aが6連続Waveで全く同じ値のままになっているケースを検出し、入力の疑義フラグとして扱う。

**出力**: `"TRUE"` または `"FALSE"`

**計算ロジック**:

```python
window = MID_WINDOW_MONTHS  # 6

for each person sorted by wave:
    for each index i:
        if i < window - 1:
            flag_constant_6m[i] = "FALSE"
            continue

        segment = データ[i-window+1 : i+1]  # 直近6件
        if V, D, A すべてについて「有限値のバリエーション数 <= 1」なら "TRUE"
        else "FALSE"
```

`_is_constant_values` は有限値のみを対象にし、6件すべてが同じ値（NaNを除外）である場合に TRUE を返す。3要素すべてが TRUE のときのみ `flag_constant_6m` が `"TRUE"` となる。

**用途**:
- データ品質チェック（`trend_refined` の最優先カテゴリ「入力疑義」に連動）
- 長期にわたり同一値が続く異常応募の早期発見

---

## 5. 出力仕様

### 5.1 monthly_trendsシート

#### 5.1.1 目的

全メンバー×全Waveの詳細時系列データを提供。各指標の時間変化を追跡し、分析・検証に使用。

#### 5.1.2 列定義（最大60列）

**基本情報（5列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| person | str | 個人識別子（mail_addressが存在すれば使用） |
| name | str | 表示名 |
| wave | str | 測定月（`YYYY-MM`形式） |
| level | str | 5段階レベル（Thriving/High/Moderate/Low/Critical） |
| slope3m_pattern | str | 長期傾向（Net Growth / Net Decline / …） |

**トレンド/フラグ（8列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| trend_base | str | 中期トレンド |
| trend_recent | str | 短期トレンド |
| trend_refined | str | 統合トレンド |
| big_change | str | 個人基準「変化大」フラグ |
| big_change_abs | str | 絶対値6点以上の変化フラグ |
| stability_6 | str | 6ヶ月安定性 |
| stability_12 | str | 12ヶ月安定性 |
| flag_constant_6m | str | V/D/Aが6ヶ月同一なら `"TRUE"` |

**強み/弱み・特性（6列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| short_strength | str | 短期強み（V/D/A複数可） |
| short_weakness | str | 短期弱み |
| mid_strength | str | 中期強み |
| mid_weakness | str | 中期弱み |
| trait_strength | str | 長期特性強み |
| trait_weakness | str | 長期特性弱み |

**測定値（4列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| engagement | int | 総合エンゲージメント |
| vigor | int | 活力 |
| dedication | int | 熱意 |
| absorption | int | 没頭 |

**変化量・モメンタム（5列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| E_delta_1 | float | 今月の変化量 |
| E_delta_1_prev | float | 先月の変化量 |
| E_sign_change_count_6m | int | 直近6ヶ月の符号変化回数 |
| E_delta_1_std_12 | float | 標準化変化量（12ヶ月基準） |
| E_momentum_3 | float | 3ヶ月モメンタム |

**移動統計・傾き（9列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| E_mean_3 | float | 3ヶ月移動平均 |
| E_mean_6 | float | 6ヶ月移動平均 |
| E_std_6 | float | 6ヶ月標準偏差 |
| E_std_12 | float | 12ヶ月標準偏差 |
| E_std_18 | float | 18ヶ月標準偏差 |
| E_iqr_6 | float | 6ヶ月IQR |
| E_slope_6 | float | 6ヶ月傾き |
| E_slope_12 | float | 12ヶ月傾き |
| E_slope_6_std_12 | float | 正規化6ヶ月傾き |

**正負比率（2列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| r_pos | float | 直近12ヶ月の正傾き比率 |
| r_neg | float | 直近12ヶ月の負傾き比率 |

**レベル分布・エピソード（10列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| pct_high | float | High帯累積比率 |
| pct_mid | float | Mid帯累積比率 |
| pct_low | float | Low帯累積比率 |
| episodes_recovery | int | 回復エピソード数 |
| episodes_fall | int | 下降エピソード数 |
| recovery_rate | float | 回復率（0-1） |
| fall_rate | float | 下降率（0-1） |
| episodes_low2plus | int | Low脱出エピソード |
| low_streak_max | int | Low連続最長月数 |

**V/D/A 変化・傾き（6列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| V_delta_1 | float | vigorの直近変化 |
| D_delta_1 | float | dedicationの直近変化 |
| A_delta_1 | float | absorptionの直近変化 |
| V_slope_6 | float | vigorの6ヶ月傾き |
| D_slope_6 | float | dedicationの6ヶ月傾き |
| A_slope_6 | float | absorptionの6ヶ月傾き |

**特性信頼度（6列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| trait_strength_conf_V | float | 強みがVである確率 |
| trait_strength_conf_D | float | 強みがDである確率 |
| trait_strength_conf_A | float | 強みがAである確率 |
| trait_weakness_conf_V | float | 弱みがVである確率 |
| trait_weakness_conf_D | float | 弱みがDである確率 |
| trait_weakness_conf_A | float | 弱みがAである確率 |

**補足**:
- 実際の列数はソースデータに依存し、存在する列のみが出力される (`monthly_cols = [c for c in monthly_cols if c in use.columns]`)。
- `wave` は整数ではなく `YYYY-MM` 文字列で出力される。

**次元別変化（3列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| V_delta_1 | float | vigor直近変化 |
| D_delta_1 | float | dedication直近変化 |
| A_delta_1 | float | absorption直近変化 |

**次元別傾き（3列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| V_slope_6 | float | vigor 6ヶ月傾き |
| D_slope_6 | float | dedication 6ヶ月傾き |
| A_slope_6 | float | absorption 6ヶ月傾き |

#### 5.1.3 表示仕様

- **ソート順**: person昇順、wave昇順
- **ヘッダー固定**: 1行目
- **列固定**: 最初2列（person, name）
- **オートフィルタ**: 有効
- **数値書式**:
  - 整数列: `0`
  - 浮動小数点列: `0.00`
  - 比率列（pct_*, r_*, *_rate, *_conf_*): `0.00`

### 5.2 latest_individualsシート

#### 5.2.1 目的

最新Wave時点のスナップショット。現時点の状態を素早く把握するための簡易ビュー。

#### 5.2.2 仕様

- **内容**: monthly_trendsシートから最新waveのみを抽出
- **列構成**: monthly_trendsと同一（存在する列のみ、最大60列）
- **ソート順**: person昇順
- **表示仕様**: monthly_trendsと同一

---

## 6. 実装仕様

### 6.1 データ処理パイプライン

```python
def run(input_path, output_path, mid_window=6):
    # 1. 入力読み込み＆シート選択
    xl = pd.ExcelFile(input_path)
    sheet = "rating2" if "rating2" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet)

    # 2. 基本列の整形
    df["wave"] = _to_wave(df)  # year/month or date → "YYYY-MM"
    df["group"] = np.where(df["group"].astype(str).str.strip().isin(["", "nan"]),
                           df["section"], df["group"])
    if "mail_address" in df.columns:
        df["person"] = df["mail_address"]
    elif "name" in df.columns:
        df["person"] = df["name"]
    else:
        raise RuntimeError("mail_address or name is required")

    df["vigor"] = pd.to_numeric(df.get("vigor_rating", df.get("vigor")), errors="coerce")
    df["dedication"] = pd.to_numeric(df.get("dedication_rating", df.get("dedication")), errors="coerce")
    df["absorption"] = pd.to_numeric(df.get("absorption_rating", df.get("absorption")), errors="coerce")
    if "engagement_rating" in df.columns:
        df["engagement"] = pd.to_numeric(df["engagement_rating"], errors="coerce")
    else:
        df["engagement"] = df[["vigor", "dedication", "absorption"]].sum(axis=1, min_count=3)

    # 3. 入力検証＆重複削除
    validate_input_data(df[["person", "wave", "vigor", "dedication", "absorption", "engagement"]])
    df = df.drop_duplicates(subset=["person", "wave"], keep="last")

    # 4. 特徴量パイプライン
    use = add_section_group_zscores(df, ["vigor", "dedication", "absorption", "engagement"])
    use = add_multiscale_features(use)
    use = overwrite_short_mid_personal(use, mid_window=mid_window)
    use = compute_flag_constant_6m(use)
    use = apply_personal_trend_logic(use)
    use = compute_stability_and_traits(use, mid_window=mid_window)

    # 5. レベルと変化フラグ
    use["level"] = use["engagement"].apply(_level_from_e)
    use["E_delta_1_std_12"] = np.where(use["E_std_12"] > 0,
                                       use["E_delta_1"] / use["E_std_12"], np.nan)
    use["big_change"] = np.where(
        (use["E_std_12"] > 0) & (use["E_delta_1"].abs() / use["E_std_12"] > BIG_CHANGE_PERSONAL_Z),
        "変化大", "")
    use["big_change_abs"] = np.where(use["E_delta_1"].abs() >= CHANGE_TAG_THRESHOLD, "変化大", "")

    # 6. 追加メトリクス
    use = use.merge(compute_slope_ratios(use), on=["person", "wave"], how="left")
    use = use.merge(compute_expanding_episode_distribution_metrics(use),
                    on=["person", "wave"], how="left")
    use = use.merge(compute_slope3m_pattern(use), on="person", how="left")

    # 7. 出力シート生成
    monthly_cols = [
        "person", "name", "wave",
        "level", "slope3m_pattern",
        "trend_base", "trend_recent", "trend_refined",
        "big_change", "big_change_abs",
        "stability_6", "stability_12",
        "short_strength", "short_weakness",
        "mid_strength", "mid_weakness",
        "trait_strength", "trait_weakness",
        "flag_constant_6m",
        "engagement", "vigor", "dedication", "absorption",
        "E_delta_1", "E_delta_1_prev", "E_sign_change_count_6m", "E_delta_1_std_12",
        "r_pos", "r_neg",
        "E_momentum_3",
        "E_mean_3", "E_mean_6",
        "E_std_6", "E_std_12", "E_std_18",
        "E_iqr_6",
        "E_slope_6", "E_slope_12", "E_slope_6_std_12",
        "pct_high", "pct_mid", "pct_low",
        "episodes_recovery", "episodes_fall",
        "recovery_rate", "fall_rate",
        "episodes_low2plus", "low_streak_max",
        "V_delta_1", "D_delta_1", "A_delta_1",
        "V_slope_6", "D_slope_6", "A_slope_6",
        "trait_strength_conf_V", "trait_strength_conf_D", "trait_strength_conf_A",
        "trait_weakness_conf_V", "trait_weakness_conf_D", "trait_weakness_conf_A",
    ]
    monthly_cols = [c for c in monthly_cols if c in use.columns]
    monthly_trends = use[monthly_cols].sort_values(["person", "wave"])
    latest_wave = monthly_trends["wave"].max()
    latest_individuals = monthly_trends[monthly_trends["wave"] == latest_wave]

    # 8. Excel出力（xlsxwriterが利用できれば書式設定を適用）
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as w:
        ...
```

Excel出力時は `monthly_trends` と `latest_individuals` をそれぞれ1シートに配置し、`xlsxwriter` が利用可能な場合は以下を適用する:
- 1行目を固定/フィルタ設定、最初の2列を固定。
- 整数列（V/D/A/E、エピソード系、E_sign_change_count_6m）には `0` 書式。
- 浮動小数点列（変化量・傾き・率など）には `0.00` 書式。
- 比率列（pct_*, r_*)には百分率表示 (`0.00`)。

### 6.2 主要関数一覧

| 関数名 | 目的 | 主な出力/役割 |
|--------|------|---------------|
| `validate_input_data` | 入力検証 | 必須列・値域・NaNなどをチェックし警告を出力 |
| `_to_wave` | wave生成 | year/monthまたはdateから`YYYY-MM`文字列を作成 |
| `add_section_group_zscores` | セクション/グループZ-score | V/D/A/Eに対して wave×section/group 内の偏差値を追加 |
| `add_multiscale_features` | 多尺度特徴量 | `E_mean_*`, `E_std_*`, `E_slope_*`, `E_delta_*`, `E_momentum_*`, `V/D/A` 変化などを計算 |
| `overwrite_short_mid_personal` | 個人内V/D/A強み/弱み | quantile + robust Z を用いて short/mid strength/weakness フラグを生成 |
| `apply_personal_trend_logic` | トレンド判定 | `trend_base`, `trend_recent`, `trend_refined`, `change_tag` 補助情報を付与 |
| `compute_stability_and_traits` | 安定性/特性 | `stability_6/12` と特性強み/弱み、および信頼度を計算 |
| `compute_flag_constant_6m` | 入力疑義検出 | 直近6WaveでV/D/Aが一定の場合にフラグを立てる |
| `compute_slope_ratios` | slope比率 | `r_pos`, `r_neg` を算出 |
| `compute_expanding_episode_distribution_metrics` | エピソード/分布 | `episodes_*`, `*_rate`, `pct_high/mid/low` など累積指標を付与 |
| `compute_slope3m_pattern` | パターン分類 | 直近12ヶ月の3ヶ月傾き系列を基にカテゴリ化 |

### 6.3 コマンドライン使用法

```bash
# 基本使用法
python we_analyzer.py --input workengagement.xlsx --output we_report.xlsx

# 中期ウィンドウ変更
python we_analyzer.py --input data.xlsx --output report.xlsx --mid-window 12
```

**引数**:
- `--input`, `-i`: 入力Excelファイルパス（デフォルト: workengagement.xlsx）
- `--output`, `-o`: 出力Excelファイルパス（デフォルト: we_report.xlsx）
- `--mid-window`: 中期ウィンドウサイズ（デフォルト: 6）

---

## 付録A: 更新履歴からの主要変更点

### A.0 v4.1の更新内容（2025-12-21）

1. **「変動中」状態の追加**:
   - trend_baseに新しい状態「変動中」を追加
   - E_sign_change_count_6m > 2.0 かつ E_std_6 > 3.0 で判定
   - 高頻度の符号変化と高ボラティリティを組み合わせて検出

2. **E_sign_change_count_6m指標の追加**:
   - 直近6ヶ月のE_delta_1符号変化回数をカウント
   - |E_delta_1| > TREND_DELTA(1.0)の場合のみカウント対象
   - 変動中判定に使用

3. **定数の更新と統一**:
   - STABILITY_STD_STABLE: 1.5 → 1.2（Python/JavaScript共通）
   - STABILITY_STD_UNSTABLE: 3.3 → 3.0（Python/JavaScript共通）
   - STABILITY_MOMENTUM_STABLE: 0.5（新規明示）
   - TREND_RECENT_DELTA: 3.0 → 2.0（変動中判定にも使用）

4. **変数名の統一**:
   - 旧変数名（Trend_B_*, C_*）を削除し、最終出力名を内部でも使用
   - compute_C_columns → compute_stability_and_traits に関数名変更
   - STABILITY_RANGE_EPS（旧C_STABILITY_RANGE_EPS）に統一

5. **JavaScript（evaluate.gs）との完全整合**:
   - 全定数値をPythonと一致
   - ペア定数（Z_POS/NEG, MIN_SLOPE_POS/NEG）を単一定数に統合
   - 不等号演算子の一貫性を確保

### A.1 トレンド検出ロジックの更新

1. **trend_base条件の強化**:
   - E_slope_6_std_12（正規化傾き）条件を追加
   - 上昇中/低下中の判定に2つの条件パスを導入
   - 「変動中」状態を追加し、高頻度変動を検出

2. **trend_recent の統合**:
   - trend_recent_type（変化量）とtrend_recent_run（連続性）を統合
   - 7種類の状態に簡略化

3. **trend_refined の精緻化**:
   - 回復/復活の判定にE_min6_past/E_max6_pastを使用
   - 悪化/低下危機の区別を追加

### A.2 slope3m_pattern の更新

1. **Net Growth/Decline判定の強化**:
   - E_slope_12とE_slope_6_std_12による検証を追加
   - 短期的偏りではなく中長期的一貫性を要求

2. **優先順位の明確化**:
   - 5ステップの明確な分類フロー
   - U-Shape/Inverted-Uの検出ロジック改善

### A.3 新規指標の追加

1. **E_sign_change_count_6m**: 直近6ヶ月の符号変化回数（v4.1で追加）
2. **E_delta_1_std_12**: 個人内標準化変化量
3. **r_pos / r_neg**: 直近12ヶ月のslope正負比率
4. **E_mean_3**: 3ヶ月移動平均（既存のE_mean_6に追加）

### A.4 定数の更新

- `TREND_SLOPE_STD_POS`: 0.4 → **0.45**
- `TREND_SLOPE_STD_NEG`: -0.4 → **-0.45**
- `TREND_RECENT_DELTA`: **2.0**（更新）
- `BIG_CHANGE_PERSONAL_Z`: **2.0**（新規）

---

## 付録B: よくある質問

### Q1: slope3m_patternはなぜ個人ごとに1つだけか？

A: 長期的なパターン（最大12ヶ月）を評価するため、最新時点の判定のみを使用。各Wave時点での過去12ヶ月は重複が多く、情報量が少ないため。

### Q2: Expanding計算とRolling計算の違いは？

A:
- **Expanding**: 各時点で過去全データを使用（累積計算）
- **Rolling**: 固定ウィンドウ（例: 6ヶ月）のみを使用

特性評価やエピソード指標はExpandingを使用し、短中期トレンドはRollingを使用。

### Q3: なぜ定数比較に厳密不等号を使うのか？

A: 境界値ケースでの判定の一貫性を保つため。`>=`と`>`の混在は混乱を招くため、原則として`>`と`<`のみを使用。

### Q4: E_slope_6_std_12が重要な理由は？

A: 個人ごとの変動幅を考慮した正規化により、変動の大きい人と小さい人を公平に評価できる。生の傾きだけでは、変動の大きい人の小さな傾きを過小評価してしまう。

---

**文書終了**
