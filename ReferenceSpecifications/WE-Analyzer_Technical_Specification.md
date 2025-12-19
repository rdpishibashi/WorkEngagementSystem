# WE Analyzer 技術仕様書

**バージョン**: v4.0
**更新日**: 2025-12-09
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
- `year`: 測定年（整数）
- `month`: 測定月（整数）
- `mail_address` または `name`: 個人識別子
- `section`: 所属部署
- `group`: 所属グループ（オプション）
- `vigor_rating`: 活力評価値（0-6の整数）
- `dedication_rating`: 熱意評価値（0-6の整数）
- `absorption_rating`: 没頭評価値（0-6の整数）

**計算される列**
- `wave`: `year * 100 + month` として生成される時系列キー
- `engagement`: `vigor_rating + dedication_rating + absorption_rating`（0-54の整数）

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
| `TREND_SLOPE_POS` | 0.5 | 中期上昇トレンド判定の傾き閾値（E_slope_6用） |
| `TREND_SLOPE_NEG` | -0.5 | 中期低下トレンド判定の傾き閾値（E_slope_6用） |
| `TREND_SLOPE_STD_MIN` | 0.2 | 正規化傾きの最小閾値（ノイズ除去） |
| `TREND_SLOPE_STD_POS` | 0.45 | 正規化傾きに基づく強い上昇トレンド判定閾値 |
| `TREND_SLOPE_STD_NEG` | -0.45 | 正規化傾きに基づく強い低下トレンド判定閾値 |
| `TREND_MOMENTUM_STRONG` | 1.5 | モメンタム（E_momentum_3）の「強い変化」閾値 |
| `TREND_DELTA_STRONG` | 5.0 | Trend_B_refined 内で用いる「強い変化（ΔE）」閾値 |
| `TREND_DELTA` | 1.0 | Trend_B_refined 内で用いる「やや有意な変化」閾値 |
| `TREND_RECENT_DELTA` | 3.0 | 短期トレンド（trend_recent）の上昇／低下判定閾値 |
| `CHANGE_TAG_THRESHOLD` | 6.0 | 急上昇／急落、および組織基準 big_change_abs の閾値 |
| `BIG_CHANGE_PERSONAL_Z` | 2.0 | 個人基準 big_change（\|ΔE\| が個人内2σ以上）判定閾値 |

**重要事項**: すべてのトレンド検出ロジックにおいて、定数との比較は**厳密不等号**（`>`, `<`）を使用する。`>=`、`<=`は使用しない。

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
| `STABILITY_STD_STABLE` | 1.5 | E_std_6 < この値で「安定」 |
| `STABILITY_MOMENTUM_STABLE` | 0.5 | \|E_momentum_3\| < この値で「安定」に寄与 |
| `STABILITY_STD_UNSTABLE` | 3.3 | E_std_6 > この値で「不安定」 |
| `C_STABILITY_RANGE_EPS` | 1e-6 | 不変判定の許容誤差 |

**長期（12ヶ月）安定性**
| 定数名 | 値 | 用途 |
|--------|-----|------|
| `STABILITY_STD_STABLE_LONG` | 1.5 | E_std_12 < この値で「持続安定」 |
| `STABILITY_MOMENTUM_STABLE_LONG` | 0.8 | \|E_momentum_6\| < この値で「持続安定」に寄与 |
| `STABILITY_STD_UNSTABLE_LONG` | 3.0 | E_std_12 > この値で「持続不安定」 |

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
| `SLOPE_PATTERN_WINDOW` | 12 | パターン分類に使用する最大月数 |
| `NET_RATIO_THRESHOLD` | 0.7 | Net Growth/Decline判定の正負比率閾値 |
| `SLOPE12_POS_MIN` | 0.4 | Net Growth判定のE_slope_12最小値 |
| `SLOPE12_NEG_MAX` | -0.4 | Net Decline判定のE_slope_12最大値 |
| `SLOPE6_STD12_POS_MIN` | 0.2 | Net Growth判定のE_slope_6_std_12最小値 |
| `SLOPE6_STD12_NEG_MAX` | -0.2 | Net Decline判定のE_slope_6_std_12最大値 |

### 2.6 その他の定数

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `SHORT_MIN_RECORDS` | 3 | 短期トレンド計算に必要な最小レコード数 |
| `MID_MIN_RECORDS` | 3 | 中期トレンド計算に必要な最小レコード数 |
| `LONG_MIN_RECORDS` | 6 | 長期トレンド計算に必要な最小レコード数 |
| `SHORT_MIN_DELTA` | 0 | 短期評価の最小変化量 |
| `Z_POS` | 0.5 | セクション内正のZ-score閾値 |
| `Z_NEG` | -0.5 | セクション内負のZ-score閾値 |

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
- `E_slope_3m`: 3ヶ月傾き（ウィンドウ=3）
- `E_slope_6`: 6ヶ月傾き（ウィンドウ=6）
- `E_slope_12`: 12ヶ月傾き（ウィンドウ=12）
- `V_slope_6`, `D_slope_6`, `A_slope_6`: 次元別6ヶ月傾き

### 3.2 Expanding Robust Z-score

**目的**: 累積データに基づく個人内標準化

**アルゴリズム**:
```python
def compute_robust_zscore_expanding(series):
    """
    各時点における累積中央値・IQRに基づくRobust Z-score

    z = (x - median_expanding) / (1.4826 * IQR_expanding)

    IQR = 0の場合はNaNを返す
    """
    median_exp = series.expanding().median()
    q1 = series.expanding().quantile(0.25)
    q3 = series.expanding().quantile(0.75)
    iqr = q3 - q1

    zscore = np.where(
        iqr > 0,
        (series - median_exp) / (1.4826 * iqr),
        np.nan
    )
    return zscore
```

**使用箇所**:
- セクション内Z-score計算（vigor_z, dedication_z, absorption_z, engagement_z）
- 個人内変動の標準化

### 3.3 レベルバンド化

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
| `E_momentum_3` | 3ヶ月モメンタム | `E_mean_3[t] - E_mean_3[t-3]` |

### 4.2 傾き指標

すべての傾き指標はTheil-Sen推定を使用。

| 指標名 | 定義 | ウィンドウ | 計算関数 |
|--------|------|-----------|----------|
| `E_slope_3m` | 3ヶ月傾き | 3 | `_theil_sen_slope_window(y, 3)` |
| `E_slope_6` | 6ヶ月傾き | 6 | `_theil_sen_slope_window(y, 6)` |
| `E_slope_12` | 12ヶ月傾き | 12 | `_theil_sen_slope_window(y, 12)` |
| `E_slope_6_std_12` | 正規化6ヶ月傾き | - | `E_slope_6 / E_std_12`（E_std_12 > 0の場合） |
| `V_slope_6` | vigor 6ヶ月傾き | 6 | `_theil_sen_slope_window(V, 6)` |
| `D_slope_6` | dedication 6ヶ月傾き | 6 | `_theil_sen_slope_window(D, 6)` |
| `A_slope_6` | absorption 6ヶ月傾き | 6 | `_theil_sen_slope_window(A, 6)` |

**E_slope_6_std_12の重要性**:
- 個人ごとの変動幅を考慮した正規化傾き
- 変動の大きい人の小さな傾きと、変動の小さい人の大きな傾きを同等に評価
- トレンド判定で重要な役割

### 4.3 月次メトリクス

#### 4.3.1 E_ma3（3ヶ月移動平均）

```python
E_ma3 = rolling(3).mean()
```

#### 4.3.2 E_slope_3m_ma3（3ヶ月傾きの移動平均）

```python
E_slope_3m_ma3 = E_slope_3m.rolling(3).mean()
```

### 4.4 トレンド指標

#### 4.4.1 trend_base（中期トレンド基本判定）

**目的**: 6ヶ月傾きと正規化傾きに基づく中期トレンドの基本分類

**出力**: `"上昇中"`, `"低下中"`, `"安定"`, `"未評価"`

**計算ロジック**:

```python
# 初期化
base = "安定"  # すべてのレコードのデフォルト

# 履歴不足判定
if 個人のレコード数 <= MID_MIN_RECORDS:
    base = "未評価"

# 上昇中判定（いずれかの条件）
if (
    (slope > TREND_SLOPE_POS and abs(slope_std) > TREND_SLOPE_STD_MIN)
    OR
    (slope_std > TREND_SLOPE_STD_POS)
):
    base = "上昇中"

# 低下中判定（いずれかの条件）
if (
    (slope < TREND_SLOPE_NEG and abs(slope_std) > TREND_SLOPE_STD_MIN)
    OR
    (slope_std < TREND_SLOPE_STD_NEG)
):
    base = "低下中"
```

**判定条件詳細**:

1. **上昇中**:
   - 条件A: `E_slope_6 > 0.5` **かつ** `|E_slope_6_std_12| > 0.2`
   - 条件B: `E_slope_6_std_12 > 0.45`
   - いずれかが成立すれば「上昇中」

2. **低下中**:
   - 条件A: `E_slope_6 < -0.5` **かつ** `|E_slope_6_std_12| > 0.2`
   - 条件B: `E_slope_6_std_12 < -0.45`
   - いずれかが成立すれば「低下中」

3. **安定**: 上昇中でも低下中でもない状態

4. **未評価**: データ点数 ≤ 3

#### 4.4.2 trend_recent（短期トレンド）

**目的**: 直近1ヶ月の変化量（E_delta_1）に基づく短期トレンド分類

**出力**: `"連続上昇"`, `"急上昇"`, `"上昇"`, `"横ばい"`, `"下降"`, `"急落"`, `"連続下降"`

**計算ロジック**:

```python
# 閾値
recent_thr = TREND_RECENT_DELTA  # 3.0
acute_thr = CHANGE_TAG_THRESHOLD  # 6.0

# 現在と前回の変化を取得
delta = E_delta_1[t]
delta_prev = E_delta_1_prev[t]

# 初期値
trend = "横ばい"

# ステップ1: 中程度の変化
if TREND_RECENT_DELTA <= delta < CHANGE_TAG_THRESHOLD:
    trend = "上昇"
if -CHANGE_TAG_THRESHOLD < delta <= -TREND_RECENT_DELTA:
    trend = "下降"

# ステップ2: 急激な変化（上書き）
if delta >= CHANGE_TAG_THRESHOLD:
    trend = "急上昇"
if delta <= -CHANGE_TAG_THRESHOLD:
    trend = "急落"

# ステップ3: 連続変化（最優先で上書き）
if delta >= TREND_RECENT_DELTA and delta_prev >= TREND_RECENT_DELTA:
    trend = "連続上昇"
if delta <= -TREND_RECENT_DELTA and delta_prev <= -TREND_RECENT_DELTA:
    trend = "連続下降"
```

**優先順位** (高→低):
1. 連続上昇/連続下降
2. 急上昇/急落
3. 上昇/下降
4. 横ばい

**判定条件**:
- `連続上昇`: `delta ≥ 3.0` **かつ** `delta_prev ≥ 3.0`
- `急上昇`: `delta ≥ 6.0`
- `上昇`: `3.0 ≤ delta < 6.0`
- `横ばい`: `-3.0 < delta < 3.0`
- `下降`: `-6.0 < delta ≤ -3.0`
- `急落`: `delta ≤ -6.0`
- `連続下降`: `delta ≤ -3.0` **かつ** `delta_prev ≤ -3.0`

#### 4.4.3 trend_refined（統合トレンド）

**目的**: trend_base（中期）とtrend_recent（短期）を統合した13種類の詳細トレンド判定

**出力**:
- 加速系: `"上昇加速"`, `"低下加速"`
- 急変系: `"悪化"`, `"低下危機"`
- 回復系: `"回復"`, `"復活"`
- 継続系: `"上昇継続"`, `"低下継続"`
- 期待/警戒系: `"上昇期待"`, `"回復期待"`, `"低下警戒"`
- その他: `"安定維持"`, `"未評価"`

**計算ロジック**:

```python
def _refine(row):
    base = row["trend_base"]
    recent = row["trend_recent"]
    slope_val = row["E_slope_6"]
    prev_slope = row.get("Prev_E_slope_6", np.nan)
    mom = row["E_momentum_3"]
    d1 = row["E_delta_1"]
    d1_prev = row.get("E_delta_1_prev", np.nan)
    current_e = row["engagement"]
    min6 = row["E_min6_past"]  # 直近6ヶ月の最小値（過去分）
    max6 = row["E_max6_past"]  # 直近6ヶ月の最大値（過去分）

    # 未評価の場合
    if base == "未評価":
        if recent in ("上昇", "下降", "横ばい"):
            return recent
        return "未評価"

    # 強い変化の判定
    strong_momentum_up = (mom > TREND_MOMENTUM_STRONG)  # 1.5
    strong_momentum_down = (mom < -TREND_MOMENTUM_STRONG)
    consecutive_strong_up = (d1_prev > TREND_DELTA_STRONG)  # 5.0
    consecutive_strong_down = (d1_prev < -TREND_DELTA_STRONG)
    moderate_momentum = abs(mom) < TREND_MOMENTUM_STRONG
    moderate_delta = abs(d1) < TREND_DELTA_STRONG

    # === 1. 上昇加速 ===
    if (
        base == "上昇中"
        and recent in ("上昇", "急上昇", "連続上昇")
        and slope_val > TREND_SLOPE_POS  # 0.5
        and d1 > TREND_DELTA_STRONG  # 5.0
        and (strong_momentum_up or consecutive_strong_up)
    ):
        return "上昇加速"

    # === 2. 上昇継続 ===
    if (
        base == "上昇中"
        and recent == "横ばい"
        and slope_val > TREND_SLOPE_POS
        and -TREND_MOMENTUM_STRONG < mom < TREND_MOMENTUM_STRONG
        and -TREND_DELTA_STRONG < d1 < TREND_DELTA_STRONG
    ):
        return "上昇継続"

    # === 3. 悪化 / 低下危機 ===
    if (
        base == "上昇中"
        and recent in ("下降", "急落")
        and slope_val > TREND_SLOPE_POS
        and d1 < -TREND_DELTA_STRONG
        and (strong_momentum_down or consecutive_strong_down)
    ):
        # 過去6ヶ月の最小値と比較
        if current_e >= min6:
            return "悪化"
        else:
            return "低下危機"

    # === 4. 低下加速 ===
    if (
        base == "低下中"
        and recent in ("下降", "急落", "連続下降")
        and slope_val < TREND_SLOPE_NEG  # -0.5
        and d1 < -TREND_DELTA_STRONG
        and (strong_momentum_down or consecutive_strong_down)
    ):
        return "低下加速"

    # === 5. 回復期待 ===
    if (
        base == "低下中"
        and recent == "横ばい"
        and d1 > TREND_DELTA  # 1.0
    ):
        return "回復期待"

    # === 6. 低下継続 ===
    if (
        base == "低下中"
        and recent == "横ばい"
        and slope_val < TREND_SLOPE_NEG
        and moderate_momentum
        and moderate_delta
    ):
        return "低下継続"

    # === 7. 回復 / 復活 ===
    if (
        (base == "低下中" or (base == "安定" and prev_slope < TREND_SLOPE_NEG))
        and recent in ("上昇", "急上昇", "連続上昇")
        and d1 > TREND_DELTA_STRONG
        and (strong_momentum_up or consecutive_strong_up)
    ):
        # 過去6ヶ月の最大値と比較
        if current_e <= max6:
            return "回復"
        else:
            return "復活"

    # === 8. 上昇期待 ===
    if (
        base == "安定"
        and recent in ("上昇", "急上昇")
        and -TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS
        and d1 > TREND_DELTA
        and (strong_momentum_up or (d1_prev < SHORT_MIN_DELTA))
    ):
        return "上昇期待"

    # === 9. 低下警戒 ===
    if (
        base == "安定"
        and recent in ("下降", "急落")
        and -TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS
        and d1 < -TREND_DELTA
        and d1_prev >= 0
        and (d1 <= -TREND_DELTA_STRONG or mom <= -TREND_MOMENTUM_STRONG)
    ):
        return "低下警戒"

    # === 10. 傾き不明の場合（安定） ===
    if base == "安定" and slope_val is NaN:
        if recent in ("上昇", "急上昇"):
            return "上昇期待"
        if recent in ("下降", "急落"):
            return "低下警戒"
        return "安定維持"

    # === 11. デフォルト ===
    if base == "低下中":
        return "低下継続"
    if base == "上昇中":
        return "上昇継続"

    return "安定維持"
```

**判定優先順位** (上から順に評価):
1. 未評価処理
2. 上昇加速
3. 上昇継続
4. 悪化/低下危機
5. 低下加速
6. 回復期待
7. 低下継続
8. 回復/復活
9. 上昇期待
10. 低下警戒
11. 傾き不明時の処理
12. デフォルト（継続系 or 安定維持）

### 4.5 変化フラグ

#### 4.5.1 big_change（個人基準変化大）

**定義**: 個人内標準偏差の2倍以上の変化

**計算**:
```python
if E_std_12 > 0 and abs(E_delta_1) / E_std_12 >= 2.0:
    big_change = "変化大"
else:
    big_change = ""
```

**意味**: 個人の過去12ヶ月の変動パターンから見て、今月の変化が異常に大きい

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

**出力**: `"安定"`, `"やや安定"`, `"不安定"`, `"完全不変"`

**計算ロジック**:

```python
# Step 1: 履歴チェック
if 過去6ヶ月のレコード数 < 3:
    return ""

# Step 2: 完全不変チェック（6ヶ月レンジ ≈ 0）
range_6 = E_max_6 - E_min_6
if range_6 < C_STABILITY_RANGE_EPS:  # 1e-6
    return "完全不変"

# Step 3: 標準偏差とモメンタムによる判定
std_6 = E_std_6
mom_3 = abs(E_momentum_3)

# 安定
if std_6 < STABILITY_STD_STABLE and mom_3 < STABILITY_MOMENTUM_STABLE:
    return "安定"

# 不安定
if std_6 > STABILITY_STD_UNSTABLE:
    return "不安定"

# やや安定（中間）
return "やや安定"
```

**判定基準**:
- `完全不変`: `range_6 < 1e-6`
- `安定`: `E_std_6 < 1.5` **かつ** `|E_momentum_3| < 0.5`
- `不安定`: `E_std_6 > 3.3`
- `やや安定`: 上記いずれにも該当しない

#### 4.6.2 stability_12（長期安定性）

**目的**: 直近12ヶ月の変動パターンから長期的安定性を評価

**出力**: `"持続安定"`, `"やや持続安定"`, `"持続不安定"`, `"完全不変"`

**計算ロジック**:

```python
# Step 1: 履歴チェック
if 過去12ヶ月のレコード数 < 6:
    return ""

# Step 2: 完全不変チェック（12ヶ月レンジ ≈ 0）
range_12 = E_max_12 - E_min_12
if range_12 < C_STABILITY_RANGE_EPS:
    return "完全不変"

# Step 3: 標準偏差とモメンタムによる判定
std_12 = E_std_12
mom_6 = abs(E_momentum_6)

# 持続安定
if std_12 < STABILITY_STD_STABLE_LONG and mom_6 < STABILITY_MOMENTUM_STABLE_LONG:
    return "持続安定"

# 持続不安定
if std_12 > STABILITY_STD_UNSTABLE_LONG:
    return "持続不安定"

# やや持続安定（中間）
return "やや持続安定"
```

**判定基準**:
- `完全不変`: `range_12 < 1e-6`
- `持続安定`: `E_std_12 < 1.5` **かつ** `|E_momentum_6| < 0.8`
- `持続不安定`: `E_std_12 > 3.0`
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

if max_val - min_val > SHORT_MIN_DELTA:  # 0
    strength = max_dim
    weakness = min_dim
else:
    strength = ""
    weakness = ""

return (strength, weakness)
```

**注意事項**:
- 3つの次元間の平均値を比較
- 最大と最小の差が閾値（0）を超える場合のみ判定
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

if max_val - min_val > SHORT_MIN_DELTA:  # 0
    strength = max_dim
    weakness = min_dim
else:
    strength = ""
    weakness = ""

return (strength, weakness)
```

**注意事項**:
- 3つの次元の傾き（slope）を比較
- 最大と最小の差が閾値を超える場合のみ判定
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

**アルゴリズム**:

```python
def classify_slope3m_pattern(e_slope_3m_seq, e_slope_12, e_slope_6_std_12):
    """
    e_slope_3m_seq: 直近最大12ヶ月のE_slope_3m配列（古→新）
    e_slope_12: 12ヶ月傾き
    e_slope_6_std_12: 正規化6ヶ月傾き
    """

    # 有効値のみ抽出
    valid_slopes = [x for x in e_slope_3m_seq if x is not None]
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

    if e_slope_12 is not None and e_slope_6_std_12 is not None:
        # Net Growth条件
        if (
            r_pos >= 0.7
            and mean_3m > 0
            and e_slope_12 >= 0.4
            and e_slope_6_std_12 >= 0.2
        ):
            return "Net Growth"

        # Net Decline条件
        if (
            r_neg >= 0.7
            and mean_3m < 0
            and e_slope_12 <= -0.4
            and e_slope_6_std_12 <= -0.2
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
    # 直近最大12ヶ月のE_slope_3mを取得
    window_slopes = E_slope_3m[max(0, i-11):i+1]
    valid_slopes = window_slopes[~isnan(window_slopes)]

    if len(valid_slopes) > 0:
        r_pos = (valid_slopes > 0の個数) / len(valid_slopes)
        r_neg = (valid_slopes < 0の個数) / len(valid_slopes)
    else:
        r_pos = NaN
        r_neg = NaN
```

**使用箇所**:
- slope3m_pattern分類の補助情報
- 月次トレンドシートでの可視化

### 4.12 flag_constant_6m（入力妥当性フラグ）

**目的**: 6ヶ月以上、全く同じ値が入力されている疑わしいケースを検出

**出力**: `True` または `False`

**計算ロジック**:

```python
# 各個人の時系列をWave昇順でソート
for each person:
    # 比較タプル: (engagement, vigor, dedication, absorption)
    tuples = [(E, V, D, A) for each wave]

    # 連続同一値の期間を計測
    current_tuple = tuples[0]
    current_start_date = dates[0]
    max_duration = 0

    for i in range(1, len(tuples)):
        if tuples[i] == current_tuple:
            # 継続
            continue
        else:
            # 変化あり: 期間を計算
            duration = dates[i-1] - current_start_date
            max_duration = max(max_duration, duration)

            # 新しいシーケンス開始
            current_tuple = tuples[i]
            current_start_date = dates[i]

    # 最後のシーケンスもチェック
    duration = dates[-1] - current_start_date
    max_duration = max(max_duration, duration)

    # 判定
    if max_duration >= 183日:  # 約6ヶ月
        flag_constant_6m = True
    else:
        flag_constant_6m = False
```

**用途**:
- データ品質チェック
- 同じ値が長期間入力されている場合、入力ミスまたはシステムエラーの可能性

---

## 5. 出力仕様

### 5.1 monthly_trendsシート

#### 5.1.1 目的

全メンバー×全Waveの詳細時系列データを提供。各指標の時間変化を追跡し、分析・検証に使用。

#### 5.1.2 列定義（全61列）

**基本情報（3列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| person | str | 個人識別子（mail_address） |
| name | str | 名前 |
| wave | int | 測定時期（YYYYMM形式） |

**レベル・パターン（2列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| level | str | エンゲージメントレベル（5段階） |
| slope3m_pattern | str | 長期推移パターン（7種類） |

**トレンド（3列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| trend_base | str | 中期トレンド基本判定（4種類） |
| trend_recent | str | 短期トレンド（7種類） |
| trend_refined | str | 統合トレンド（13種類） |

**変化フラグ（2列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| big_change | str | 個人基準変化大フラグ |
| big_change_abs | str | 組織基準変化大フラグ |

**安定性（2列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| stability_6 | str | 短期安定性（6ヶ月） |
| stability_12 | str | 長期安定性（12ヶ月） |

**個人内強み/弱み（4列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| short_strength | str | 短期強み次元（V/D/A） |
| short_weakness | str | 短期弱み次元（V/D/A） |
| mid_strength | str | 中期強み次元（V/D/A） |
| mid_weakness | str | 中期弱み次元（V/D/A） |

**特性評価（8列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| trait_strength | str | 特性強み次元（V/D/A） |
| trait_weakness | str | 特性弱み次元（V/D/A） |
| trait_strength_conf_V | float | V強み支持率（0-1） |
| trait_strength_conf_D | float | D強み支持率（0-1） |
| trait_strength_conf_A | float | A強み支持率（0-1） |
| trait_weakness_conf_V | float | V弱み支持率（0-1） |
| trait_weakness_conf_D | float | D弱み支持率（0-1） |
| trait_weakness_conf_A | float | A弱み支持率（0-1） |

**妥当性フラグ（1列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| flag_constant_6m | bool | 6ヶ月以上同一値フラグ |

**測定値（4列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| engagement | int | 総合エンゲージメント（0-54） |
| vigor | int | 活力（0-18） |
| dedication | int | 熱意（0-18） |
| absorption | int | 没頭（0-18） |

**変化量・標準化変化（4列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| E_delta_1 | float | 直近1ヶ月変化量 |
| E_delta_1_prev | float | 1つ前の変化量 |
| E_delta_1_std_12 | float | 標準化変化量（12ヶ月基準） |
| E_momentum_3 | float | 3ヶ月モメンタム |

**正負比率（2列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| r_pos | float | 直近12ヶ月の正slope比率 |
| r_neg | float | 直近12ヶ月の負slope比率 |

**統計指標（6列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| E_mean_3 | float | 3ヶ月移動平均 |
| E_mean_6 | float | 6ヶ月移動平均 |
| E_std_6 | float | 6ヶ月標準偏差 |
| E_std_12 | float | 12ヶ月標準偏差 |
| E_std_18 | float | 18ヶ月標準偏差 |
| E_iqr_6 | float | 6ヶ月四分位範囲 |

**傾き指標（6列）**
| 列名 | 型 | 説明 |
|------|-----|------|
| E_slope_6 | float | 6ヶ月傾き |
| E_slope_12 | float | 12ヶ月傾き |
| E_slope_6_std_12 | float | 正規化6ヶ月傾き |
| E_ma3 | float | 3ヶ月移動平均 |
| E_slope_3m | float | 3ヶ月傾き |
| E_slope_3m_ma3 | float | 3ヶ月傾きの移動平均 |

**レベル分布（3列・Expanding）**
| 列名 | 型 | 説明 |
|------|-----|------|
| pct_high | float | High比率（累積） |
| pct_mid | float | Mid比率（累積） |
| pct_low | float | Low比率（累積） |

**エピソード指標（6列・Expanding）**
| 列名 | 型 | 説明 |
|------|-----|------|
| episodes_recovery | int | 回復エピソード数（累積） |
| episodes_fall | int | 下降エピソード数（累積） |
| recovery_rate | float | 回復率 |
| fall_rate | float | 下降率 |
| episodes_low2plus | int | Low脱出回数（累積） |
| low_streak_max | int | Low連続最大月数 |

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
- **列構成**: monthly_trendsと同一（全61列）
- **ソート順**: person昇順
- **表示仕様**: monthly_trendsと同一

---

## 6. 実装仕様

### 6.1 データ処理パイプライン

```python
def run(input_path, output_path, mid_window=6):
    # 1. データ読み込み
    df = pd.read_excel(input_path)

    # 2. 基本変数の準備
    df["wave"] = df["year"] * 100 + df["month"]
    df["person"] = df["mail_address"]
    df["engagement"] = df["vigor_rating"] + df["dedication_rating"] + df["absorption_rating"]

    # 3. セクション・グループ内Z-score計算
    df = add_section_group_zscores(df, ["vigor", "dedication", "absorption", "engagement"])

    # 4. 多層統計特徴量計算
    df = add_multiscale_features(df)

    # 5. 個人内メトリクスの上書き
    df = overwrite_short_mid_personal(df, mid_window=mid_window)

    # 6. トレンド判定
    df = apply_personal_trend_logic(df)

    # 7. C列（強み/弱み/安定性）計算
    df = compute_C_columns(df, mid_window=mid_window)

    # 8. 定数入力フラグ
    df = compute_flag_constant_6m(df)

    # 9. レベル判定
    df["level"] = df["engagement"].apply(_level_from_e)

    # 10. 個人標準化変化量と変化フラグ
    df["E_delta_1_std_12"] = np.where(
        df["E_std_12"] > 0,
        df["E_delta_1"] / df["E_std_12"],
        np.nan
    )
    df["big_change"] = np.where(
        (df["E_std_12"] > 0) & (df["E_delta_1"].abs() / df["E_std_12"] >= 2.0),
        "変化大", ""
    )
    df["big_change_abs"] = np.where(
        df["E_delta_1"].abs() >= 6.0,
        "変化大", ""
    )

    # 11. 月次メトリクス（E_ma3, E_slope_3m等）
    monthly_metrics_df = compute_monthly_metrics(df)
    df = df.merge(monthly_metrics_df, on=["person", "wave"], how="left")

    # 12. slope比率（r_pos, r_neg）
    slope_ratios_df = compute_slope_ratios(df)
    df = df.merge(slope_ratios_df, on=["person", "wave"], how="left")

    # 13. エピソード・分布指標（Expanding）
    epi_dist_df = compute_expanding_episode_distribution_metrics(df)
    df = df.merge(epi_dist_df, on=["person", "wave"], how="left")

    # 14. slope3m_pattern（個人ごと1つ）
    pattern_df = compute_slope3m_pattern(df)
    df = df.merge(pattern_df, on="person", how="left")

    # 15. 列名変換（内部名 → 出力名）
    df = df.rename(columns={
        "Trend_B_base": "trend_base",
        "Trend_B_recent": "trend_recent",
        "Trend_B_refined": "trend_refined",
        "C_stability": "stability_6",
        "C_stability_long": "stability_12",
        "C_short_strength": "short_strength",
        "C_short_weakness": "short_weakness",
        "C_mid_strength": "mid_strength",
        "C_mid_weakness": "mid_weakness",
        "C_trait_strength": "trait_strength",
        "C_trait_weakness": "trait_weakness",
    })

    # 16. monthly_trendsシート構築
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
        "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",
        "r_pos", "r_neg",
        "E_momentum_3",
        "E_mean_3", "E_mean_6",
        "E_std_6", "E_std_12", "E_std_18",
        "E_iqr_6",
        "E_slope_6", "E_slope_12", "E_slope_6_std_12",
        "E_ma3", "E_slope_3m", "E_slope_3m_ma3",
        "pct_high", "pct_mid", "pct_low",
        "episodes_recovery", "episodes_fall",
        "recovery_rate", "fall_rate",
        "episodes_low2plus", "low_streak_max",
        "V_delta_1", "D_delta_1", "A_delta_1",
        "V_slope_6", "D_slope_6", "A_slope_6",
        "trait_strength_conf_V", "trait_strength_conf_D", "trait_strength_conf_A",
        "trait_weakness_conf_V", "trait_weakness_conf_D", "trait_weakness_conf_A",
    ]
    monthly_cols = [c for c in monthly_cols if c in df.columns]
    monthly_trends = df[monthly_cols].sort_values(["person", "wave"])

    # 17. latest_individualsシート構築
    latest_wave = monthly_trends["wave"].max()
    latest_individuals = monthly_trends[monthly_trends["wave"] == latest_wave].copy()

    # 18. Excel出力
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as w:
        monthly_trends.to_excel(w, sheet_name="monthly_trends", index=False)
        latest_individuals.to_excel(w, sheet_name="latest_individuals", index=False)

        # 書式設定
        wb = w.book
        intfmt = wb.add_format({"num_format": "0"})
        twofmt = wb.add_format({"num_format": "0.00"})
        pctfmt = wb.add_format({"num_format": "0.00"})

        for sh, data in [("monthly_trends", monthly_trends),
                         ("latest_individuals", latest_individuals)]:
            ws = w.sheets[sh]
            ws.freeze_panes(1, 2)
            ws.autofilter(0, 0, 0, data.shape[1] - 1)

            colidx = {c: i for i, c in enumerate(data.columns)}

            # 整数列
            for key in ["vigor", "dedication", "absorption", "engagement",
                       "episodes_recovery", "episodes_fall",
                       "episodes_low2plus", "low_streak_max"]:
                if key in colidx:
                    ws.set_column(colidx[key], colidx[key], 12, intfmt)

            # 浮動小数点列
            float_keys = [
                "E_momentum_3", "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",
                "E_mean_3", "E_mean_6",
                "E_std_6", "E_std_12", "E_std_18", "E_iqr_6",
                "E_slope_12", "E_slope_6", "E_slope_6_std_12",
                "E_ma3", "E_slope_3m", "E_slope_3m_ma3",
                "V_delta_1", "D_delta_1", "A_delta_1",
                "V_slope_6", "D_slope_6", "A_slope_6",
                "recovery_rate", "fall_rate",
                "trait_strength_conf_V", "trait_strength_conf_D", "trait_strength_conf_A",
                "trait_weakness_conf_V", "trait_weakness_conf_D", "trait_weakness_conf_A"
            ]
            for key in float_keys:
                if key in colidx:
                    ws.set_column(colidx[key], colidx[key], 12, twofmt)

            # 比率列
            for key in ["pct_high", "pct_mid", "pct_low", "r_pos", "r_neg"]:
                if key in colidx:
                    ws.set_column(colidx[key], colidx[key], 12, pctfmt)
```

### 6.2 主要関数一覧

| 関数名 | 目的 | 主要処理 |
|--------|------|----------|
| `_theil_sen_slope_window` | Theil-Sen傾き推定 | 外れ値に頑健な傾き計算 |
| `add_section_group_zscores` | セクション内Z-score計算 | 組織内相対位置の標準化 |
| `add_multiscale_features` | 多層統計特徴量計算 | rolling/expanding統計 |
| `overwrite_short_mid_personal` | 個人メトリクス計算 | 個人別の統計・傾き |
| `apply_personal_trend_logic` | トレンド判定 | trend_base/recent/refined |
| `compute_C_columns` | C列計算 | 強み/弱み/安定性 |
| `compute_flag_constant_6m` | 定数入力フラグ | 入力妥当性チェック |
| `compute_monthly_metrics` | 月次メトリクス | E_ma3, E_slope_3m等 |
| `compute_slope_ratios` | slope比率計算 | r_pos, r_neg |
| `compute_expanding_episode_distribution_metrics` | エピソード・分布指標 | Expanding計算 |
| `compute_slope3m_pattern` | パターン分類 | 長期推移パターン |

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

### A.1 トレンド検出ロジックの更新

1. **trend_base条件の強化**:
   - E_slope_6_std_12（正規化傾き）条件を追加
   - 上昇中/低下中の判定に2つの条件パスを導入

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

1. **E_delta_1_std_12**: 個人内標準化変化量
2. **r_pos / r_neg**: 直近12ヶ月のslope正負比率
3. **E_mean_3**: 3ヶ月移動平均（既存のE_mean_6に追加）

### A.4 定数の更新

- `TREND_SLOPE_STD_POS`: 0.4 → **0.45**
- `TREND_SLOPE_STD_NEG`: -0.4 → **-0.45**
- `TREND_RECENT_DELTA`: **3.0**（新規）
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
