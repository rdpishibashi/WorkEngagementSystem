# trend_refined ロジック分析（最終版）

## 概要

本ドキュメントは、更新された `trend_refined_condition.xlsx` の仕様を分析し、現在の `we_analyzer.py` の実装と比較したものです。

---

## 1. 更新された仕様の特徴

### 1.1 主要な改善点

✅ **シンプル化された条件:**
- `change_tag` が「変化大」または「not 変化大」の2値に統一
- 絶対値を使用した明確な閾値判定
- 複雑な momentum_6 や履歴比較（min6/max6）を削除

✅ **一貫性のある優先度システム:**
- Priority 1-9 で明確に定義
- 数字が小さいほど優先度が高い
- コンフリクト時の解決ルールが明確

✅ **完全なカバレッジ:**
- すべての (trend_base × trend_recent) の組み合わせをカバー
- 入力疑義検出を最優先として実装

### 1.2 入力変数

| 変数名 | 値の範囲 | 説明 |
|--------|----------|------|
| **trend_recent** | 上昇, 下降, 横ばい, 急上昇, 急落, 連続上昇, 連続下降 | 短期トレンド（先月比） |
| **trend_base** | 上昇中, 低下中, 安定, 未評価, 横ばい | 中期トレンド（6ヶ月傾き） |
| **change_tag** | 変化大, not 変化大 | 個人内2σ基準の大変化 |
| **\|E_slope_6\|** | 実数値 | 6ヶ月傾きの絶対値 |
| **\|E_delta_1\|** | 実数値 | 月次変化量の絶対値 |
| **flag_constant_6m** | Y/N | 6ヶ月間の値が不変かどうか |

### 1.3 使用する定数

コメントに基づき、以下の定数を統合・絶対値化します:

| 新定数名 | 統合前の定数 | 値 | 用途 |
|----------|--------------|-----|------|
| **TREND_SLOPE** | TREND_SLOPE_POS, TREND_SLOPE_NEG | 0.5 | E_slope_6 の閾値（絶対値） |
| **TREND_SLOPE_STD** | TREND_SLOPE_STD_POS, TREND_SLOPE_STD_NEG | 0.45 | E_slope_6_std_12 の閾値（絶対値） |
| **MIN_SLOPE** | MIN_SLOPE_POS, MIN_SLOPE_NEG | 0.20 | 個人内傾き閾値（絶対値） |
| **SLOPE12_THRESHOLD** | SLOPE12_POS_MIN, SLOPE12_NEG_MAX | 0.4 | E_slope_12 の閾値（絶対値） |
| **SLOPE6_STD12_THRESHOLD** | SLOPE6_STD12_POS_MIN, SLOPE6_STD12_NEG_MAX | 0.2 | E_slope_6_std_12 の閾値（絶対値） |
| **Z_THRESHOLD** | Z_POS, Z_NEG | 0.8 | robust z-score の閾値（絶対値） |
| **TREND_DELTA_STRONG** | （変更なし） | 5.0 | 大きな変化の閾値 |
| **TREND_DELTA** | （変更なし） | 1.0 | 中程度の変化の閾値 |
| **BIG_CHANGE_PERSONAL_Z** | （変更なし） | 2.0 | 個人内2σ基準 |

### 1.4 change_tag の定義（確認済み）

コメントより、**Option B** を使用:

```python
change_tag = "変化大" if (E_std_12 > 0 and abs(E_delta_1) / E_std_12 >= BIG_CHANGE_PERSONAL_Z) else "not 変化大"
```

- 個人内標準偏差の2倍以上の変化を「変化大」と判定
- 絶対的な閾値ではなく、個人内での相対的な大きさで判定

---

## 2. 完全なルール定義

### 2.1 Priority 1（最優先）

| trend_refined | 条件 |
|---------------|------|
| **入力疑義** | `flag_constant_6m == Y` （他の条件より優先） |
| **上昇加速** | `trend_recent in [上昇, 急上昇, 連続上昇]` AND `trend_base == "上昇中"` AND `change_tag == "変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |
| **低下加速** | `trend_recent in [下降, 急落, 連続下降]` AND `trend_base == "低下中"` AND `change_tag == "変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |

### 2.2 Priority 2

| trend_refined | 条件 |
|---------------|------|
| **上昇継続** | `trend_recent in [上昇, 横ばい]` AND `trend_base == "上昇中"` AND `change_tag == "not 変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |
| **低下継続** | `trend_recent in [下降, 横ばい]` AND `trend_base == "低下中"` AND `change_tag == "not 変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |

### 2.3 Priority 3

| trend_refined | 条件 |
|---------------|------|
| **復活** | `trend_recent in [上昇, 急上昇, 連続上昇]` AND `trend_base == "低下中"` AND `change_tag == "変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |
| **悪化** | `trend_recent in [下降, 急落, 連続下降]` AND `trend_base == "上昇中"` AND `change_tag == "変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |

### 2.4 Priority 4

| trend_refined | 条件 |
|---------------|------|
| **回復** | `trend_recent in [上昇, 急上昇, 連続上昇]` AND `trend_base == "低下中"` AND `change_tag == "not 変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |
| **低下危機** | `trend_recent in [下降, 急落, 連続下降]` AND `trend_base == "上昇中"` AND `change_tag == "not 変化大"` AND `abs(E_slope_6) > TREND_SLOPE` |

### 2.5 Priority 5

| trend_refined | 条件 |
|---------------|------|
| **上昇期待** | `trend_recent in [上昇, 急上昇]` AND `trend_base == "安定"` AND `abs(E_delta_1) > TREND_DELTA` |
| **低下警戒** | `trend_recent in [下降, 急落]` AND `trend_base == "安定"` AND `abs(E_delta_1) > TREND_DELTA` |

### 2.6 Priority 6

| trend_refined | 条件 |
|---------------|------|
| **低下懸念** | `trend_recent == "横ばい"` AND `trend_base == "上昇中"` AND `abs(E_delta_1) > TREND_DELTA` |
| **回復期待** | `trend_recent == "横ばい"` AND `trend_base == "低下中"` AND `abs(E_delta_1) > TREND_DELTA` |

### 2.7 Priority 7（未評価・安定の一般パターン）

| trend_refined | 条件 |
|---------------|------|
| **上昇** | `trend_recent in [上昇, 急上昇]` AND `trend_base in ["未評価", "安定"]` |
| **下降** | `trend_recent in [下降, 急落]` AND `trend_base in ["未評価", "安定"]` |
| **横ばい** | `trend_recent == "横ばい"` AND `trend_base in ["未評価", "安定"]` |

### 2.8 Priority 9（最も優先度が低い）

| trend_refined | 条件 |
|---------------|------|
| **安定維持** | `trend_recent == "横ばい"` AND `trend_base == "横ばい"` AND `change_tag == "not 変化大"` |

**注**: trend_base="横ばい" は trend_base="安定" と同じ意味だが、区別のため別単語を使用

---

## 3. ロジックの明確化

### 3.1 「復活」vs「回復」/ 「悪化」vs「低下危機」の区別

**更新された仕様では非常に明確:**

| ペア | Priority 3（変化大） | Priority 4（not 変化大） |
|------|----------------------|------------------------|
| 上昇系 | **復活** | **回復** |
| 下降系 | **悪化** | **低下危機** |

**共通条件:**
- trend_base の方向（上昇中 or 低下中）
- trend_recent の方向（上昇系 or 下降系）
- abs(E_slope_6) > TREND_SLOPE

**唯一の違い:**
- `change_tag == "変化大"` → Priority 3（復活/悪化）
- `change_tag == "not 変化大"` → Priority 4（回復/低下危機）

**コメントの指摘通り:**
- abs(E_delta_1) > TREND_DELTA_STRONG の条件は不要（change_tag の中に含まれる考え方）
- trend_base の方向性だけで十分判定できる

### 3.2 「上昇継続」「低下継続」の条件

**仕様の明確化:**
- trend_base と trend_recent が同じ方向
- **change_tag = "not 変化大"**（ここが重要！）
- abs(E_slope_6) > TREND_SLOPE（中期的に傾きがある）

**現在のコードとの違い:**
- 現在: `recent == "横ばい"` のみチェック（上昇継続の場合）
- 仕様: `recent in ["上昇", "横ばい"]` または `["下降", "横ばい"]`

### 3.3 「上昇期待」「低下警戒」の条件

**コメントの変更内容:**
- ~~`abs(E_delta_1) <= TREND_DELTA_STRONG`~~ （削除）
- ✅ `abs(E_delta_1) > TREND_DELTA`（変更後）

**理由:**
- 安定状態からの変化を検出するため
- 小さい変化（> 1.0）でも注目すべき

---

## 4. 現在の実装との比較

### 4.1 実装が必要な主要な変更

| # | 変更内容 | 現在のコード | 必要な修正 | 該当行 |
|---|----------|--------------|------------|--------|
| 1 | **入力疑義の実装** | ❌ 未実装 | flag_constant_6m を最優先でチェック | - |
| 2 | **change_tag の統一** | big_change 列あり | 「変化大」「not 変化大」の2値化 | 1241-1246 |
| 3 | **上昇継続の条件拡張** | recent == "横ばい" のみ | recent in ["上昇", "横ばい"] に拡張 | 566-577 |
| 4 | **低下継続の条件拡張** | 同様の問題 | recent in ["下降", "横ばい"] に拡張 | 608-617 |
| 5 | **履歴比較の削除** | E_min6_past/E_max6_past 使用 | change_tag で判定に変更 | 620-628, 579-591 |
| 6 | **momentum チェック削除** | E_momentum_3 多用 | 削除 | 複数箇所 |
| 7 | **上昇期待・低下警戒の条件** | 複雑な条件 | abs(E_delta_1) > TREND_DELTA のみ | 634-659 |
| 8 | **定数の統合と絶対値化** | 正負別々の定数 | 統合して絶対値使用 | 17-48 |

### 4.2 定数の変更

**we_analyzer.py の先頭（lines 17-48）を以下のように変更:**

```python
# ========== Constants (Updated) ==========
# Slope thresholds (using absolute values)
TREND_SLOPE = 0.5              # 旧: TREND_SLOPE_POS/NEG
TREND_SLOPE_STD = 0.45         # 旧: TREND_SLOPE_STD_POS/NEG
MIN_SLOPE = 0.20               # 旧: MIN_SLOPE_POS/NEG

# Delta thresholds
TREND_DELTA_STRONG = 5.0
TREND_DELTA = 1.0

# Z-score threshold (using absolute values)
Z_THRESHOLD = 0.8              # 旧: Z_POS/Z_NEG

# Personal change threshold
BIG_CHANGE_PERSONAL_Z = 2.0

# Slope pattern constants
SLOPE12_THRESHOLD = 0.4        # 旧: SLOPE12_POS_MIN/NEG_MAX
SLOPE6_STD12_THRESHOLD = 0.2   # 旧: SLOPE6_STD12_POS_MIN/NEG_MAX
NET_RATIO_THRESHOLD = 0.7

# Other constants (unchanged)
TREND_MOMENTUM_STRONG = 1.5    # ⚠️ trend_refined では使用しない
LEVEL_THRIVING = 43
LEVEL_CRITICAL = 3
# ... (他の定数は変更なし)
```

### 4.3 個別ケースの比較

#### ケース1: 上昇加速（Priority 1）

**仕様:**
```
trend_recent in [上昇, 急上昇, 連続上昇]
AND trend_base == "上昇中"
AND change_tag == "変化大"
AND abs(E_slope_6) > TREND_SLOPE
```

**現在のコード (lines 554-564):**
```python
if (
    base == "上昇中"
    and recent in ("上昇", "急上昇", "連続上昇")
    and has_slope
    and slope_val > TREND_SLOPE_POS  # 0.5
    and has_d1
    and d1 > TREND_DELTA_STRONG  # 5.0
    and (strong_momentum_up or consecutive_strong_up)  # ⚠️ 削除すべき
):
    return "上昇加速"
```

**必要な修正:**
- ✅ trend_recent のチェック: OK
- ✅ trend_base のチェック: OK
- ⚠️ slope_val > 0.5 → `abs(slope_val) > TREND_SLOPE` に変更
- ❌ momentum チェック削除
- ✅ change_tag == "変化大" を追加

---

#### ケース2: 上昇継続（Priority 2）

**仕様:**
```
trend_recent in [上昇, 横ばい]
AND trend_base == "上昇中"
AND change_tag == "not 変化大"
AND abs(E_slope_6) > TREND_SLOPE
```

**現在のコード (lines 566-577):**
```python
if (
    base == "上昇中"
    and recent == "横ばい"  # ❌ "上昇" が抜けている！
    and has_slope
    and slope_val > TREND_SLOPE_POS
    and has_mom
    and (-TREND_MOMENTUM_STRONG < mom < TREND_MOMENTUM_STRONG)  # ⚠️ 削除すべき
    and has_d1
    and (-TREND_DELTA_STRONG < d1 < TREND_DELTA_STRONG)  # ⚠️ 削除すべき
):
    return "上昇継続"
```

**必要な修正:**
- ❌ recent in ["上昇", "横ばい"] に拡張（重要！）
- ❌ momentum チェック削除
- ❌ delta の範囲チェック削除
- ✅ change_tag == "not 変化大" を追加

---

#### ケース3: 復活（Priority 3）

**仕様:**
```
trend_recent in [上昇, 急上昇, 連続上昇]
AND trend_base == "低下中"
AND change_tag == "変化大"
AND abs(E_slope_6) > TREND_SLOPE
```

**現在のコード (lines 620-628):**
```python
recovery = (
    (base == "低下中" or (base == "安定" and has_prev_slope and prev_slope < TREND_SLOPE_NEG))
    and recent in ("上昇", "急上昇", "連続上昇")
    and has_d1
    and d1 > TREND_DELTA_STRONG
    and (strong_momentum_up or consecutive_strong_up)  # ⚠️ 削除すべき
)
if recovery and pd.notna(current_e) and pd.notna(max6):
    return "回復" if current_e <= max6 else "復活"  # ❌ 履歴比較を削除
```

**必要な修正:**
- ❌ 履歴比較（current_e vs max6）を削除
- ✅ change_tag で「復活」と「回復」を区別
- ❌ momentum チェック削除
- ❌ trend_base == "安定" からの回復は削除（仕様にない）

**新しいロジック:**
```python
if (trend_base == "低下中" and
    trend_recent in ["上昇", "急上昇", "連続上昇"] and
    change_tag == "変化大" and
    abs(E_slope_6) > TREND_SLOPE):
    return "復活"
```

---

#### ケース4: 回復（Priority 4）

**仕様:**
```
trend_recent in [上昇, 急上昇, 連続上昇]
AND trend_base == "低下中"
AND change_tag == "not 変化大"
AND abs(E_slope_6) > TREND_SLOPE
```

**コメントの指摘:**
> abs(E_delta_1) > TREND_DELTA_STRONG の条件は、trend_base == "低下中" の条件に含まれるので削除

**新しいロジック:**
```python
if (trend_base == "低下中" and
    trend_recent in ["上昇", "急上昇", "連続上昇"] and
    change_tag == "not 変化大" and
    abs(E_slope_6) > TREND_SLOPE):
    return "回復"
```

---

#### ケース5: 上昇期待（Priority 5）

**仕様（コメント反映後）:**
```
trend_recent in [上昇, 急上昇]
AND trend_base == "安定"
AND abs(E_delta_1) > TREND_DELTA  # 変更: <= TREND_DELTA_STRONG から変更
```

**現在のコード (lines 634-644):**
```python
if (
    base == "安定"
    and recent in ("上昇", "急上昇")
    and has_slope
    and (-TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS)  # ⚠️ 削除すべき
    and has_d1
    and d1 > TREND_DELTA  # 1.0
    and (strong_momentum_up or (pd.notna(d1_prev) and d1_prev < SHORT_MIN_DELTA))  # ⚠️ 削除すべき
):
    return "上昇期待"
```

**必要な修正:**
- ❌ slope の範囲チェック削除
- ❌ momentum チェック削除
- ✅ `abs(E_delta_1) > TREND_DELTA` のみに簡略化

---

#### ケース6: 入力疑義（Priority 1）

**仕様:**
```
flag_constant_6m == Y
（最優先）
```

**現在のコード:**
- ❌ **実装されていない！**
- flag_constant_6m は計算されている（lines 862-895）が、trend_refined では使用されていない

**必要な実装:**
```python
def _refine(row: pd.Series) -> str:
    # 最優先チェック
    if row.get("flag_constant_6m", False):
        return "入力疑義"

    # 以降の処理...
```

---

## 5. カバレッジ分析

### 5.1 全組み合わせのカバー状況

**trend_base × trend_recent のマトリックス:**

| trend_base ↓ / trend_recent → | 上昇系 | 下降系 | 横ばい |
|------------------------------|--------|--------|--------|
| **上昇中** | ✅ P1:上昇加速 / P2:上昇継続 | ✅ P3:悪化 / P4:低下危機 | ✅ P2:上昇継続 / P6:低下懸念 |
| **低下中** | ✅ P3:復活 / P4:回復 | ✅ P1:低下加速 / P2:低下継続 | ✅ P2:低下継続 / P6:回復期待 |
| **安定** | ✅ P5:上昇期待 / P7:上昇 | ✅ P5:低下警戒 / P7:下降 | ✅ P7:横ばい |
| **未評価** | ✅ P7:上昇 | ✅ P7:下降 | ✅ P7:横ばい |
| **横ばい** | - | - | ✅ P9:安定維持 |

**Plus: P1:入力疑義（flag_constant_6m=Y）がすべてを上書き**

**結論:** ✅ **すべての組み合わせがカバーされている**

### 5.2 Priority による衝突解決

**例1: 上昇中 + 上昇**
- change_tag == "変化大" → P1:上昇加速
- change_tag == "not 変化大" → P2:上昇継続
- **解決:** change_tag で明確に区別

**例2: 上昇中 + 横ばい**
- change_tag == "not 変化大" AND abs(E_slope_6) > TREND_SLOPE → P2:上昇継続
- abs(E_delta_1) > TREND_DELTA → P6:低下懸念
- **解決:** P2 > P6（Priorityで解決）

**例3: 安定 + 上昇**
- abs(E_delta_1) > TREND_DELTA → P5:上昇期待
- 条件なし → P7:上昇
- **解決:** P5 > P7（Priorityで解決）

**結論:** ✅ **優先度システムで衝突が適切に解決される**

---

## 6. 実装計画

### 6.1 修正が必要な箇所

| 優先度 | ファイル | 行数 | 修正内容 | 影響範囲 |
|--------|----------|------|----------|----------|
| 🔴 高 | we_analyzer.py | 17-48 | 定数の統合・絶対値化 | 全体 |
| 🔴 高 | we_analyzer.py | 525-673 | _refine() 関数の全面書き換え | trend_refined のみ |
| 🔴 高 | we_analyzer.py | 1241-1246 | change_tag の2値化 | big_change 列 |
| 🟡 中 | we_analyzer.py | 231-318 | MIN_SLOPE等の絶対値化 | 個人内フラグ |
| 🟡 中 | we_analyzer.py | 1096-1186 | slope3m_pattern の閾値更新 | パターン分類 |
| 🟢 低 | 全体 | - | momentum_3 使用箇所の確認 | trend_refined 以外 |

### 6.2 新しい _refine() 関数の実装案

```python
def _refine(row: pd.Series) -> str:
    """
    更新された仕様に基づく trend_refined の判定
    Priority 順に評価し、最初にマッチしたものを返す
    """
    trend_recent = row["Trend_B_recent"]
    trend_base = row["Trend_B_base"]
    E_slope_6 = row.get("E_slope_6", np.nan)
    E_delta_1 = row.get("E_delta_1", np.nan)
    E_std_12 = row.get("E_std_12", np.nan)
    flag_constant_6m = row.get("flag_constant_6m", False)

    # change_tag の計算（個人内2σ基準）
    if pd.notna(E_std_12) and E_std_12 > 0 and pd.notna(E_delta_1):
        change_tag = "変化大" if abs(E_delta_1) / E_std_12 >= BIG_CHANGE_PERSONAL_Z else "not 変化大"
    else:
        change_tag = "not 変化大"

    # trend_recent のカテゴリー化
    up_trends = ["上昇", "急上昇", "連続上昇"]
    down_trends = ["下降", "急落", "連続下降"]

    # Priority 1: 入力疑義（最優先）
    if flag_constant_6m:
        return "入力疑義"

    # Priority 1: 上昇加速
    if (trend_recent in up_trends and
        trend_base == "上昇中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "上昇加速"

    # Priority 1: 低下加速
    if (trend_recent in down_trends and
        trend_base == "低下中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "低下加速"

    # Priority 2: 上昇継続
    if (trend_recent in ["上昇", "横ばい"] and
        trend_base == "上昇中" and
        change_tag == "not 変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "上昇継続"

    # Priority 2: 低下継続
    if (trend_recent in ["下降", "横ばい"] and
        trend_base == "低下中" and
        change_tag == "not 変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "低下継続"

    # Priority 3: 復活
    if (trend_recent in up_trends and
        trend_base == "低下中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "復活"

    # Priority 3: 悪化
    if (trend_recent in down_trends and
        trend_base == "上昇中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "悪化"

    # Priority 4: 回復
    if (trend_recent in up_trends and
        trend_base == "低下中" and
        change_tag == "not 変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "回復"

    # Priority 4: 低下危機
    if (trend_recent in down_trends and
        trend_base == "上昇中" and
        change_tag == "not 変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "低下危機"

    # Priority 5: 上昇期待
    if (trend_recent in ["上昇", "急上昇"] and
        trend_base == "安定" and
        pd.notna(E_delta_1) and abs(E_delta_1) > TREND_DELTA):
        return "上昇期待"

    # Priority 5: 低下警戒
    if (trend_recent in ["下降", "急落"] and
        trend_base == "安定" and
        pd.notna(E_delta_1) and abs(E_delta_1) > TREND_DELTA):
        return "低下警戒"

    # Priority 6: 低下懸念
    if (trend_recent == "横ばい" and
        trend_base == "上昇中" and
        pd.notna(E_delta_1) and abs(E_delta_1) > TREND_DELTA):
        return "低下懸念"

    # Priority 6: 回復期待
    if (trend_recent == "横ばい" and
        trend_base == "低下中" and
        pd.notna(E_delta_1) and abs(E_delta_1) > TREND_DELTA):
        return "回復期待"

    # Priority 7: 未評価または安定の一般パターン
    if trend_base in ["未評価", "安定"]:
        if trend_recent in ["上昇", "急上昇"]:
            return "上昇"
        if trend_recent in ["下降", "急落"]:
            return "下降"
        if trend_recent == "横ばい":
            return "横ばい"

    # Priority 9: 安定維持
    # trend_base == "横ばい" は実際には "安定" と同じ意味
    if (trend_recent == "横ばい" and
        trend_base in ["安定", "横ばい"] and
        change_tag == "not 変化大"):
        return "安定維持"

    # Fallback（理論上はここに到達しないはず）
    return "未分類"
```

### 6.3 定数定義の更新

```python
# ========== Constants (Updated for absolute value usage) ==========
# Slope thresholds
TREND_SLOPE = 0.5              # E_slope_6 threshold (absolute value)
TREND_SLOPE_STD = 0.45         # E_slope_6_std_12 threshold (absolute value)
MIN_SLOPE = 0.20               # Personal slope threshold (absolute value)

# Delta thresholds
TREND_DELTA_STRONG = 5.0       # Strong change threshold
TREND_DELTA = 1.0              # Moderate change threshold

# Z-score threshold
Z_THRESHOLD = 0.8              # Robust z-score threshold (absolute value)

# Personal change detection
BIG_CHANGE_PERSONAL_Z = 2.0    # Personal 2-sigma criterion

# Slope pattern thresholds
SLOPE12_THRESHOLD = 0.4        # E_slope_12 threshold (absolute value)
SLOPE6_STD12_THRESHOLD = 0.2   # E_slope_6_std_12 threshold (absolute value)
NET_RATIO_THRESHOLD = 0.7      # Net growth/decline ratio

# Level thresholds (unchanged)
LEVEL_THRIVING = 43
LEVEL_CRITICAL = 3
LEVEL_HIGH = 32
LEVEL_LOW = 11

# Stability thresholds (unchanged)
STABILITY_RANGE_EPS = 1e-6
STABILITY_STD_STABLE = 1.0
STABILITY_STD_UNSTABLE = 2.5
STABILITY_STD_STABLE_LONG = 1.5
STABILITY_STD_UNSTABLE_LONG = 3.0

# Other constants (unchanged)
MID_MIN_RECORDS = 3
CHANGE_TAG_THRESHOLD = 6.0     # For big_change_abs
SHORT_MIN_DELTA = 2.0
TRAIT_WINDOW_MONTHS = 12
# ... (remaining constants)
```

### 6.4 個人内フラグ計算の更新

**overwrite_short_mid_personal() 関数内（lines 231-318）:**

```python
# 傾きの閾値（絶対値使用）
th_pos_s = pd.Series(np.maximum(p90s.values, MIN_SLOPE), index=df.index)
th_neg_s = pd.Series(np.minimum(p10s.values, -MIN_SLOPE), index=df.index)

# 絶対値で比較
posm = slope.notna() & (slope >= th_pos_s) & (zs.isna() | (abs(zs) > Z_THRESHOLD))
negm = slope.notna() & (slope <= th_neg_s) & (zs.isna() | (abs(zs) < -Z_THRESHOLD))
```

**または、完全に絶対値化する場合:**

```python
# 絶対値での閾値設定
th_slope_abs = pd.Series(np.maximum(p90s.abs().values, MIN_SLOPE), index=df.index)
zs_abs = zs.abs()

# 正の傾き判定
posm = slope.notna() & (slope > 0) & (slope.abs() >= th_slope_abs) & (zs.isna() | (zs_abs > Z_THRESHOLD))

# 負の傾き判定
negm = slope.notna() & (slope < 0) & (slope.abs() >= th_slope_abs) & (zs.isna() | (zs_abs > Z_THRESHOLD))
```

### 6.5 slope3m_pattern の更新

**compute_slope3m_pattern() 関数内（lines 1096-1186）:**

```python
# 絶対値での比較に変更
if pd.notna(e_slope_12) and pd.notna(e_slope_6_std_12):
    if (
        r_pos >= NET_RATIO_THRESHOLD
        and mean_3m > 0
        and abs(e_slope_12) >= SLOPE12_THRESHOLD  # 絶対値使用
        and abs(e_slope_6_std_12) >= SLOPE6_STD12_THRESHOLD  # 絶対値使用
    ):
        patt = "Net Growth"
    elif (
        r_neg >= NET_RATIO_THRESHOLD
        and mean_3m < 0
        and abs(e_slope_12) >= SLOPE12_THRESHOLD  # 絶対値使用
        and abs(e_slope_6_std_12) >= SLOPE6_STD12_THRESHOLD  # 絶対値使用
    ):
        patt = "Net Decline"
```

---

## 7. テストケース

実装後の検証用テストケース:

| # | trend_recent | trend_base | E_slope_6 | E_delta_1 | E_std_12 | flag_6m | change_tag | 期待結果 |
|---|--------------|------------|-----------|-----------|----------|---------|------------|----------|
| 1 | 急上昇 | 上昇中 | 0.6 | 8.0 | 3.0 | N | 変化大 | 上昇加速 |
| 2 | 上昇 | 上昇中 | 0.6 | 2.0 | 3.0 | N | not 変化大 | 上昇継続 |
| 3 | 横ばい | 上昇中 | 0.6 | 0.5 | 3.0 | N | not 変化大 | 上昇継続 |
| 4 | 急上昇 | 低下中 | 0.6 | 8.0 | 3.0 | N | 変化大 | 復活 |
| 5 | 急上昇 | 低下中 | 0.6 | 4.0 | 3.0 | N | not 変化大 | 回復 |
| 6 | 上昇 | 安定 | 0.2 | 2.0 | 3.0 | N | not 変化大 | 上昇期待 |
| 7 | 横ばい | 上昇中 | 0.6 | -1.5 | 3.0 | N | not 変化大 | 低下懸念 |
| 8 | 横ばい | 低下中 | -0.6 | 1.5 | 3.0 | N | not 変化大 | 回復期待 |
| 9 | 上昇 | 未評価 | 0.1 | 0.5 | NaN | N | - | 上昇 |
| 10 | 横ばい | 安定 | 0.0 | 0.3 | 3.0 | N | not 変化大 | 安定維持 |
| 11 | (any) | (any) | (any) | (any) | (any) | Y | - | 入力疑義 |
| 12 | 下降 | 上昇中 | 0.6 | -7.0 | 3.0 | N | 変化大 | 悪化 |
| 13 | 急落 | 上昇中 | 0.6 | -4.0 | 3.0 | N | not 変化大 | 低下危機 |
| 14 | 連続下降 | 低下中 | -0.7 | -8.0 | 3.0 | N | 変化大 | 低下加速 |
| 15 | 下降 | 低下中 | -0.6 | -3.0 | 3.0 | N | not 変化大 | 低下継続 |

---

## 8. まとめ

### 8.1 更新された仕様の評価

**✅ 長所:**
1. **シンプルで明確**: 複雑な momentum や履歴比較を削除
2. **完全なカバレッジ**: すべての組み合わせが定義されている
3. **一貫性のある優先度**: Priority システムで衝突を解決
4. **実装しやすい**: 条件が明確で、コード化が容易
5. **メンテナンス性向上**: 絶対値化により定数管理が簡素化

**⚠️ 注意点:**
1. **trend_base="横ばい"**: 実装時は "安定" として扱う
2. **change_tag の計算**: 個人内2σ基準を使用
3. **絶対値の徹底**: すべての傾き・Z-score で絶対値を使用

### 8.2 実装の影響範囲

| 影響範囲 | 変更の大きさ | リスク | 備考 |
|----------|--------------|--------|------|
| trend_refined ロジック | 🔴 大 | 低 | 全面書き換えだが仕様が明確 |
| 定数定義 | 🟡 中 | 低 | 統合により管理しやすくなる |
| 個人内フラグ | 🟡 中 | 中 | 絶対値化の影響を確認 |
| slope3m_pattern | 🟢 小 | 低 | 閾値の絶対値化のみ |
| 出力結果 | 🔴 大 | 中 | trend_refined が変わるため検証必要 |

### 8.3 推奨される実装順序

1. **定数の統合** (we_analyzer.py lines 17-48)
   - 正負分離された定数を統合
   - テスト: 既存の動作が変わらないことを確認

2. **change_tag の明確化** (lines 1241-1246)
   - 「変化大」「not 変化大」の2値に統一
   - テスト: big_change 列の値を確認

3. **_refine() 関数の書き換え** (lines 525-673)
   - 新しいロジックに完全置き換え
   - テスト: テストケースで検証

4. **個人内フラグの更新** (lines 231-318)
   - 絶対値使用に変更
   - テスト: フラグの変化を確認

5. **slope3m_pattern の更新** (lines 1096-1186)
   - 閾値を絶対値化
   - テスト: パターン分類の変化を確認

6. **統合テスト**
   - 全体の出力を既存データで検証
   - 予期しない変化がないか確認

### 8.4 次のステップ

**質問事項:**
- ✅ change_tag の定義: 個人内2σ基準（Option B）を確認済み
- ✅ Priority の意味: 数字が小さい方が優先を確認済み
- ✅ 定数の統合: すべて絶対値化を確認済み
- ✅ 条件の削除: コメント通りの修正を確認済み

**実装可否:**
この分析に基づいて、we_analyzer.py の修正を実施してもよろしいでしょうか？

**確認事項:**
1. テストデータで実装前後の比較を行いますか？
2. 既存の出力（we_report.xlsx）をバックアップしますか？
3. 段階的な実装（定数→ロジック→個人内フラグ）を希望されますか？

---

## 付録A: 定数一覧（更新前後の対応）

| 用途 | 旧定数名 | 新定数名 | 値 | 使用箇所 |
|------|----------|----------|-----|----------|
| E_slope_6 閾値（正） | TREND_SLOPE_POS | TREND_SLOPE | 0.5 | trend_refined |
| E_slope_6 閾値（負） | TREND_SLOPE_NEG | (削除) | -0.5 | - |
| E_slope_6_std_12 閾値（正） | TREND_SLOPE_STD_POS | TREND_SLOPE_STD | 0.45 | trend_base |
| E_slope_6_std_12 閾値（負） | TREND_SLOPE_STD_NEG | (削除) | -0.45 | - |
| 個人内傾き閾値（正） | MIN_SLOPE_POS | MIN_SLOPE | 0.20 | 個人内フラグ |
| 個人内傾き閾値（負） | MIN_SLOPE_NEG | (削除) | -0.20 | - |
| Z-score 閾値（正） | Z_POS | Z_THRESHOLD | 0.8 | 個人内フラグ |
| Z-score 閾値（負） | Z_NEG | (削除) | -0.8 | - |
| E_slope_12 閾値（正） | SLOPE12_POS_MIN | SLOPE12_THRESHOLD | 0.4 | slope3m_pattern |
| E_slope_12 閾値（負） | SLOPE12_NEG_MAX | (削除) | -0.4 | - |
| E_slope_6_std_12 閾値（正） | SLOPE6_STD12_POS_MIN | SLOPE6_STD12_THRESHOLD | 0.2 | slope3m_pattern |
| E_slope_6_std_12 閾値（負） | SLOPE6_STD12_NEG_MAX | (削除) | -0.2 | - |
| 大変化閾値 | TREND_DELTA_STRONG | (変更なし) | 5.0 | trend_refined |
| 中変化閾値 | TREND_DELTA | (変更なし) | 1.0 | trend_refined |
| 個人内2σ | BIG_CHANGE_PERSONAL_Z | (変更なし) | 2.0 | change_tag |

---

## 付録B: trend_refined の全パターン対応表

| trend_base | trend_recent | change_tag | \|E_slope_6\| | \|E_delta_1\| | Priority | trend_refined |
|------------|--------------|------------|---------------|---------------|----------|---------------|
| (any) | (any) | (any) | (any) | (any) | 1 | **入力疑義** (flag_6m=Y) |
| 上昇中 | 上昇/急上昇/連続上昇 | 変化大 | > 0.5 | - | 1 | **上昇加速** |
| 低下中 | 下降/急落/連続下降 | 変化大 | > 0.5 | - | 1 | **低下加速** |
| 上昇中 | 上昇/横ばい | not 変化大 | > 0.5 | - | 2 | **上昇継続** |
| 低下中 | 下降/横ばい | not 変化大 | > 0.5 | - | 2 | **低下継続** |
| 低下中 | 上昇/急上昇/連続上昇 | 変化大 | > 0.5 | - | 3 | **復活** |
| 上昇中 | 下降/急落/連続下降 | 変化大 | > 0.5 | - | 3 | **悪化** |
| 低下中 | 上昇/急上昇/連続上昇 | not 変化大 | > 0.5 | - | 4 | **回復** |
| 上昇中 | 下降/急落/連続下降 | not 変化大 | > 0.5 | - | 4 | **低下危機** |
| 安定 | 上昇/急上昇 | - | - | > 1.0 | 5 | **上昇期待** |
| 安定 | 下降/急落 | - | - | > 1.0 | 5 | **低下警戒** |
| 上昇中 | 横ばい | - | - | > 1.0 | 6 | **低下懸念** |
| 低下中 | 横ばい | - | - | > 1.0 | 6 | **回復期待** |
| 未評価/安定 | 上昇/急上昇 | - | - | - | 7 | **上昇** |
| 未評価/安定 | 下降/急落 | - | - | - | 7 | **下降** |
| 未評価/安定 | 横ばい | - | - | - | 7 | **横ばい** |
| 横ばい(安定) | 横ばい | not 変化大 | - | - | 9 | **安定維持** |

---

**以上で分析を終わります。実装の準備ができましたら、お知らせください。**
