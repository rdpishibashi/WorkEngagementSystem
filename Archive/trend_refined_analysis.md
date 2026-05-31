# trend_refined Logic Analysis

## Summary

This document analyzes the `trend_refined` logic specification from `trend_refined_condition.xlsx` and compares it with the current implementation in `we_analyzer.py`.

---

## 1. Specification Coverage Analysis

### 1.1 Input Variables

The specification uses 4 primary input variables:

1. **trend_recent**: 上昇, 下降, 横ばい
2. **trend_base**: 上昇中, 低下中, 安定, 未評価, (横ばい*)
3. **change_tag**: 変化大, none, don't care
4. **flag_constant_6m**: Y, N (only used in one case)

*Note: Row 12 shows trend_base="横ばい" which may be equivalent to "安定"

### 1.2 Coverage Matrix

| Priority | trend_base | trend_recent | change_tag | flag_constant_6m | trend_refined | Count |
|----------|------------|--------------|------------|------------------|---------------|-------|
| 1 | 上昇中 | 上昇 | 変化大 | - | 上昇加速 | 1 |
| 1 | 上昇中 | 上昇 or 横ばい | none | - | 上昇継続 | 2 |
| 1 | 低下中 | 下降 or 横ばい | none | - | 低下継続 | 2 |
| 1 | 低下中 | 下降 | 変化大 | - | 低下加速 | 1 |
| 2 | 低下中 | 上昇 | 変化大 | - | 復活 | 1 |
| 2 | 低下中 | 上昇 | don't care | - | 回復 | 1 |
| 2 | 上昇中 | 下降 | don't care | - | 低下危機 | 1 |
| 2 | 上昇中 | 下降 | 変化大 | - | 悪化 | 1 |
| 3 | 安定 | 上昇 | don't care | - | 上昇期待 | 1 |
| 3 | 安定 | 下降 | don't care | - | 低下警戒 | 1 |
| 4 | 上昇中 | 横ばい | don't care | - | 低下懸念 | 1 |
| 4 | 低下中 | 横ばい | don't care | - | 回復期待 | 1 |
| 4 | 横ばい/安定 | 横ばい | none | - | 安定維持 | 1 |
| 5 | 未評価 | 上昇 | don't care | - | 上昇 | 1 |
| 5 | 未評価 | 下降 | don't care | - | 下降 | 1 |
| 5 | 未評価 | 横ばい | don't care | - | 横ばい | 1 |
| 5 | 横ばい/安定 | 横ばい | none | Y | 入力疑義 | 1 |

**Total: 17 rules**

### 1.3 Completeness Check

**Are all combinations covered?**

The specification does NOT explicitly cover all theoretical combinations. Let me enumerate:

- **trend_base** has 4 main values: 上昇中, 低下中, 安定, 未評価
- **trend_recent** has 3 values: 上昇, 下降, 横ばい
- **change_tag** has 3 states: 変化大, none, don't care

This gives us 4 × 3 = **12 base combinations** (ignoring change_tag for now).

#### Covered Combinations:

| trend_base | trend_recent=上昇 | trend_recent=下降 | trend_recent=横ばい |
|------------|------------------|------------------|-------------------|
| 上昇中 | ✓ (Priority 1) | ✓ (Priority 2) | ✓ (Priority 4, 1) |
| 低下中 | ✓ (Priority 2) | ✓ (Priority 1) | ✓ (Priority 4, 1) |
| 安定 | ✓ (Priority 3) | ✓ (Priority 3) | ✓ (Priority 4, 5) |
| 未評価 | ✓ (Priority 5) | ✓ (Priority 5) | ✓ (Priority 5) |

**Result: All 12 base combinations are covered.**

However, there are **ambiguities** due to overlapping rules:

1. **上昇中 + 上昇**: Can be either "上昇加速" (if 変化大) or "上昇継続" (if none)
2. **上昇中 + 横ばい**: Can be either "上昇継続" (Priority 1, if none) or "低下懸念" (Priority 4, don't care)
3. **低下中 + 上昇**: Can be either "復活" (if 変化大) or "回復" (don't care)
4. **低下中 + 下降**: Can be either "低下加速" (if 変化大) or "低下継続" (if none)
5. **低下中 + 横ばい**: Can be either "低下継続" (Priority 1, if none) or "回復期待" (Priority 4, don't care)
6. **上昇中 + 下降**: Can be either "悪化" (if 変化大) or "低下危機" (don't care)
7. **安定 + 横ばい**: Can be either "安定維持" (Priority 4, if none) or "入力疑義" (Priority 5, if none + flag_constant_6m=Y)

### 1.4 Issue: Ambiguous Conditions

The "don't care" in change_tag creates **logical overlap**. For example:
- Priority 2 (低下中 + 上昇): "復活" requires 変化大, "回復" says don't care
  - If 変化大=true: Both rules match → "復活" wins (Priority 2)
  - If 変化大=false: Only "回復" matches → "回復"
  - **This is consistent**

- Priority 1 (上昇中 + 上昇): "上昇加速" requires 変化大, "上昇継続" requires none
  - Wait, the spec says "上昇継続" has trend_recent="上昇 or 横ばい"
  - If trend_recent=上昇 and 変化大=true → "上昇加速"
  - If trend_recent=上昇 and 変化大=false/none → "上昇継続"
  - **This is consistent**

- Priority 1 (上昇中 + 横ばい): "上昇継続" requires none
- Priority 4 (上昇中 + 横ばい): "低下懸念" says don't care
  - If change_tag=none: Both rules could match
  - **Priority 1 should win** (higher priority)
  - But this seems inconsistent with the intent

**Recommendation**: The specification needs clarification on:
1. Whether "don't care" means "any value" or "ignore this condition"
2. How priority resolves conflicts when multiple rules match

---

## 2. Comparison with Current Implementation

### 2.1 Current Implementation Overview

The current `_refine()` function (lines 525-673 in we_analyzer.py) uses:

**Input Variables:**
- `trend_base` (Trend_B_base): 上昇中, 低下中, 安定, 未評価
- `trend_recent` (Trend_B_recent): 上昇, 下降, 横ばい, 急上昇, 急落, 連続上昇, 連続下降
- `E_slope_6`: 6-month slope value
- `Prev_E_slope_6`: Previous 6-month slope
- `E_momentum_3`: 3-month momentum
- `E_delta_1`: Monthly change
- `E_delta_1_prev`: Previous monthly change
- `E_COL`: Current engagement score
- `E_min6_past`, `E_max6_past`: Historical min/max for recovery/fall detection

**Constants Used:**
- `TREND_SLOPE_POS = 0.5`
- `TREND_SLOPE_NEG = -0.5`
- `TREND_MOMENTUM_STRONG = 1.5`
- `TREND_DELTA_STRONG = 5.0`
- `TREND_DELTA = 1.0`

### 2.2 Key Differences

| Aspect | Current Implementation | Specification |
|--------|------------------------|---------------|
| **Complexity** | High: Complex nested conditions with multiple thresholds | Low: Simple decision tree based on 3-4 variables |
| **Input Variables** | 10+ variables (slopes, momentum, deltas, historical values) | 4 variables (trend_recent, trend_base, change_tag, flag_constant_6m) |
| **trend_recent Values** | 7 values (includes 急上昇, 急落, 連続上昇, 連続下降) | 3 values (上昇, 下降, 横ばい) |
| **change_tag** | Not directly used; inferred from momentum/delta conditions | Explicitly used as input |
| **flag_constant_6m** | Exists but NOT used in trend_refined logic | Used only for "入力疑義" detection |
| **Recovery/Fall Logic** | Uses E_min6_past/E_max6_past to distinguish 回復 vs 復活, 悪化 vs 低下危機 | Appears to use only change_tag (変化大) for this distinction |
| **Priority System** | Implicit in if-elif order | Explicit priority levels 1-5 |

### 2.3 Detailed Logic Comparison

#### Case 1: 上昇加速

**Specification (Priority 1):**
```
trend_recent=上昇 AND trend_base=上昇中 AND change_tag=変化大
```

**Current Implementation (lines 554-564):**
```python
if (
    base == "上昇中"
    and recent in ("上昇", "急上昇", "連続上昇")
    and has_slope
    and slope_val > TREND_SLOPE_POS  # > 0.5
    and has_d1
    and d1 > TREND_DELTA_STRONG  # > 5.0
    and (strong_momentum_up or consecutive_strong_up)
):
    return "上昇加速"
```

**Differences:**
- Current uses more specific recent values (includes 急上昇, 連続上昇)
- Current checks slope_val > 0.5
- Current requires d1 > 5.0 (equivalent to 変化大)
- Current requires strong momentum OR consecutive strong delta

**Mapping**: change_tag=変化大 seems to map to `d1 > TREND_DELTA_STRONG (5.0)` AND strong momentum conditions

#### Case 2: 回復 vs 復活

**Specification (Priority 2):**
```
復活: trend_recent=上昇 AND trend_base=低下中 AND change_tag=変化大
回復: trend_recent=上昇 AND trend_base=低下中 AND change_tag=don't care
```

**Current Implementation (lines 620-628):**
```python
recovery = (
    (base == "低下中" or (base == "安定" and has_prev_slope and prev_slope < TREND_SLOPE_NEG))
    and recent in ("上昇", "急上昇", "連続上昇")
    and has_d1
    and d1 > TREND_DELTA_STRONG  # > 5.0
    and (strong_momentum_up or consecutive_strong_up)
)
if recovery and pd.notna(current_e) and pd.notna(max6):
    return "回復" if current_e <= max6 else "復活"
```

**Differences:**
- Current uses **historical comparison** (current_e vs max6) to distinguish 回復 vs 復活
- Specification uses **change_tag** (変化大) to distinguish
- Current includes additional condition: can recover from "安定" with previous negative slope
- Both require strong change (d1 > 5.0)

**This is a significant difference in logic!**

#### Case 3: 上昇継続

**Specification (Priority 1):**
```
trend_recent=(上昇 or 横ばい) AND trend_base=上昇中 AND change_tag=none
```

**Current Implementation (lines 566-577):**
```python
if (
    base == "上昇中"
    and recent == "横ばい"  # Only 横ばい, not 上昇
    and has_slope
    and slope_val > TREND_SLOPE_POS  # > 0.5
    and has_mom
    and (-TREND_MOMENTUM_STRONG < mom < TREND_MOMENTUM_STRONG)  # -1.5 < mom < 1.5
    and has_d1
    and (-TREND_DELTA_STRONG < d1 < TREND_DELTA_STRONG)  # -5.0 < d1 < 5.0
):
    return "上昇継続"
```

**Differences:**
- Current ONLY checks recent="横ばい", NOT "上昇"!
- Current requires moderate momentum and delta (not strong)
- Specification says both 上昇 and 横ばい should lead to 上昇継続 (with change_tag=none)

**This is a gap: Current implementation doesn't handle (上昇中 + 上昇 + no 変化大) → 上昇継続**

#### Case 4: 入力疑義

**Specification (Priority 5):**
```
trend_recent=横ばい AND trend_base=横ばい/安定 AND change_tag=none AND flag_constant_6m=Y
```

**Current Implementation:**
- **Not implemented at all!**
- flag_constant_6m is computed (lines 862-895) but never used in trend_refined logic

---

## 3. Missing or Inconsistent Cases

### 3.1 Cases in Specification but NOT in Current Code

1. **入力疑義** (Priority 5)
   - Not implemented
   - Should detect when values are constant for 6 months

### 3.2 Cases in Current Code but NOT in Specification

1. **急上昇, 急落, 連続上昇, 連続下降** as trend_recent values
   - Current code generates these (lines 496-520)
   - Specification only mentions 上昇, 下降, 横ばい
   - **Need clarification**: Should these be mapped to simpler categories?

### 3.3 Logic Inconsistencies

1. **上昇継続 condition**: Spec says "上昇 or 横ばい", but current code only checks "横ばい"

2. **回復 vs 復活 distinction**:
   - Current: Uses historical comparison (current_e vs max6)
   - Spec: Uses change_tag (変化大)
   - **Which is correct?**

3. **悪化 vs 低下危機 distinction**:
   - Current: Uses historical comparison (current_e vs min6)
   - Spec: Uses change_tag (変化大)
   - **Which is correct?**

---

## 4. Simplified Logic from Specification

If we implement the specification exactly as written, the logic would be:

```python
def trend_refined_from_spec(trend_recent, trend_base, change_tag, flag_constant_6m):
    # Normalize trend_recent to simple categories (上昇, 下降, 横ばい)
    if trend_recent in ["急上昇", "連続上昇"]:
        trend_recent = "上昇"
    elif trend_recent in ["急落", "連続下降"]:
        trend_recent = "下降"

    # Priority 1
    if trend_base == "上昇中" and trend_recent == "上昇" and change_tag == "変化大":
        return "上昇加速"
    if trend_base == "上昇中" and trend_recent in ["上昇", "横ばい"] and change_tag == "none":
        return "上昇継続"
    if trend_base == "低下中" and trend_recent in ["下降", "横ばい"] and change_tag == "none":
        return "低下継続"
    if trend_base == "低下中" and trend_recent == "下降" and change_tag == "変化大":
        return "低下加速"

    # Priority 2
    if trend_base == "低下中" and trend_recent == "上昇" and change_tag == "変化大":
        return "復活"
    if trend_base == "低下中" and trend_recent == "上昇":  # don't care
        return "回復"
    if trend_base == "上昇中" and trend_recent == "下降":  # don't care
        return "低下危機"
    if trend_base == "上昇中" and trend_recent == "下降" and change_tag == "変化大":
        return "悪化"

    # Priority 3
    if trend_base == "安定" and trend_recent == "上昇":
        return "上昇期待"
    if trend_base == "安定" and trend_recent == "下降":
        return "低下警戒"

    # Priority 4
    if trend_base == "上昇中" and trend_recent == "横ばい":
        return "低下懸念"
    if trend_base == "低下中" and trend_recent == "横ばい":
        return "回復期待"
    if trend_base in ["安定", "横ばい"] and trend_recent == "横ばい" and change_tag == "none":
        return "安定維持"

    # Priority 5
    if trend_base == "未評価" and trend_recent == "上昇":
        return "上昇"
    if trend_base == "未評価" and trend_recent == "下降":
        return "下降"
    if trend_base == "未評価" and trend_recent == "横ばい":
        return "横ばい"
    if trend_base in ["安定", "横ばい"] and trend_recent == "横ばい" and change_tag == "none" and flag_constant_6m:
        return "入力疑義"

    # Default fallback
    return "未分類"
```

**Note**: This has **logical issues** due to overlapping rules (e.g., Priority 2 has both specific and don't care conditions for the same base case).

---

## 5. Questions for Clarification

1. **trend_base="横ばい"**: Is this the same as "安定"? (Row 12 in spec)

2. **change_tag values**:
   - How is change_tag determined? Is it from `big_change` column?
   - What threshold defines 変化大?
   - Current code seems to use `d1 > TREND_DELTA_STRONG (5.0)` - is this correct?

3. **"don't care" semantics**:
   - Does it mean "any value" or "ignore this condition"?
   - How to handle overlapping rules with different priorities?

4. **trend_recent variants**:
   - Should 急上昇/急落/連続上昇/連続下降 be mapped to 上昇/下降?
   - Or should they be treated differently?

5. **回復 vs 復活 / 悪化 vs 低下危機**:
   - Current code uses historical comparison (E vs historical min/max)
   - Spec uses change_tag (変化大)
   - **Which logic is correct?**

6. **Priority conflict resolution**:
   - Example: 上昇中 + 横ばい + none
     - Priority 1: 上昇継続
     - Priority 4: 低下懸念
   - Which should win?

7. **Missing combinations**:
   - What if none of the rules match? (e.g., edge cases)
   - Should there be a default "未分類" or error?

---

## 6. Recommendations

1. **Clarify the specification**:
   - Resolve ambiguities (横ばい vs 安定, don't care semantics)
   - Add explicit priority conflict resolution rules
   - Define change_tag calculation method

2. **Decide on approach**:
   - **Option A**: Simplify to spec (lose historical comparison logic)
   - **Option B**: Enhance spec to include historical comparison
   - **Option C**: Hybrid approach

3. **Add test cases**:
   - Create test data for each of the 17 rules
   - Verify edge cases and overlapping conditions

4. **Implement 入力疑義**:
   - Currently missing from implementation
   - Important for data quality detection

5. **Document change_tag mapping**:
   - Clarify how E_delta_1, E_std_12, big_change map to change_tag
