# trend_refined Logic Analysis (Updated Specification)

## Summary

This document analyzes the **updated** `trend_refined` logic specification from `trend_refined_condition.xlsx` (located in Playbook folder) and compares it with the current implementation in `we_analyzer.py`.

**Key Improvements in Updated Spec:**
- ✅ Removed complex E_momentum_6 dependency
- ✅ Removed historical E_min6_past/E_max6_past comparison logic
- ✅ Uses simpler, more explicit conditions based on |E_slope_6| and |E_delta_1|
- ✅ Clear priority ordering (1-9)

---

## 1. Updated Specification Overview

### 1.1 Input Variables

The updated specification uses **6 primary variables**:

1. **trend_recent**: 上昇, 下降, 横ばい, 急上昇, 急落, 連続上昇, 連続下降
2. **trend_base**: 上昇中, 低下中, 安定, 未評価, 横ばい
3. **change_tag**: 変化大, none, NaN
4. **|E_slope_6|**: Absolute value of 6-month slope with threshold TREND_SLOPE
5. **|E_delta_1|**: Absolute value of monthly change with thresholds TREND_DELTA_STRONG (5.0) and TREND_DELTA (1.0)
6. **flag_constant_6m**: Y/N for detecting constant values

### 1.2 Referenced Constants

Based on current code (we_analyzer.py):
- **TREND_SLOPE_POS = 0.5** (assuming TREND_SLOPE refers to this)
- **TREND_DELTA_STRONG = 5.0**
- **TREND_DELTA = 1.0**

### 1.3 Complete Rule Table

| Priority | trend_refined | trend_recent | trend_base | change_tag | \|E_slope_6\| | \|E_delta_1\| | flag_constant_6m |
|----------|---------------|--------------|------------|------------|---------------|---------------|------------------|
| **1** | **上昇加速** | 上昇 or 急上昇 or 連続上昇 | 上昇中 | 変化大 | > TREND_SLOPE | included in 変化大 (> TREND_DELTA_STRONG) | - |
| **1** | **低下加速** | 下降 or 急落 or 連続下降 | 低下中 | 変化大 | > TREND_SLOPE | included in 変化大 (> TREND_DELTA_STRONG) | - |
| **1** | **入力疑義** | (any) | (any) | (any) | (any) | (any) | **Y** |
| **2** | **上昇継続** | 上昇 or 横ばい | 上昇中 | none | > TREND_SLOPE | - | - |
| **2** | **低下継続** | 下降 or 横ばい | 低下中 | none | > TREND_SLOPE | - | - |
| **3** | **復活** | 上昇 or 急上昇 or 連続上昇 | 低下中 | 変化大 | > TREND_SLOPE | included in 変化大 (> TREND_DELTA_STRONG) | - |
| **3** | **悪化** | 下降 or 急落 or 連続下降 | 上昇中 | 変化大 | > TREND_SLOPE | included in 変化大 (> TREND_DELTA_STRONG) | - |
| **4** | **回復** | 上昇 or 急上昇 or 連続上昇 | 低下中 | - | > TREND_SLOPE | > TREND_DELTA_STRONG | - |
| **4** | **低下危機** | 下降 or 急落 or 連続下降 | 上昇中 | - | > TREND_SLOPE | > TREND_DELTA_STRONG | - |
| **5** | **上昇期待** | 上昇 or 急上昇 | 安定 | - | - | ≦ TREND_DELTA_STRONG | - |
| **5** | **低下警戒** | 下降 or 急落 | 安定 | - | - | ≦ TREND_DELTA_STRONG | - |
| **6** | **低下懸念** | 横ばい | 上昇中 | - | - | > TREND_DELTA | - |
| **6** | **回復期待** | 横ばい | 低下中 | - | - | > TREND_DELTA | - |
| **7** | **上昇** | 上昇 or 急上昇 | 未評価 or 安定 | - | - | - | - |
| **7** | **下降** | 下降 or 急落 | 未評価 or 安定 | - | - | - | - |
| **7** | **横ばい** | 横ばい | 未評価 or 安定 | - | - | - | - |
| **9** | **安定維持** | 横ばい | 横ばい | none | - | - | - |

**Total: 17 rules** (same as before, but with different conditions)

---

## 2. Logic Clarifications from Updated Spec

### 2.1 Simplified Distinctions

**Previous Spec Issues (Now Resolved):**

1. **回復 vs 復活** - Previously unclear
   - **Now**:
     - 復活 (Priority 3): 変化大 (includes |E_delta_1| > 5.0)
     - 回復 (Priority 4): No 変化大 requirement, but |E_delta_1| > 5.0
   - **Wait, this seems redundant...** Both require |E_delta_1| > 5.0?
   - **Looking closer**: Row 3 says 変化大 includes the delta condition, Row 4 says the delta condition directly
   - **Interpretation**: 復活 requires BOTH slope > threshold AND delta > 5.0 (via 変化大), while 回復 only requires slope and delta checks

2. **悪化 vs 低下危機** - Previously unclear
   - **Now**: Same pattern as above
     - 悪化 (Priority 3): 変化大 (includes |E_delta_1| > 5.0)
     - 低下危機 (Priority 4): |E_delta_1| > 5.0

### 2.2 Key Interpretation Questions

**Question 1: What exactly is "変化大"?**

Looking at rows 0, 2, 3, 9, 11:
- change_tag column shows "変化大"
- |E_delta_1| column shows "（変化大 includes "> TREND_DELTA_STRONG"）"

**Interpretation**:
- 変化大 appears to be a **composite condition** that includes |E_delta_1| > TREND_DELTA_STRONG (5.0)
- It may also include other conditions (e.g., momentum checks from current code)

Looking at current code line 1241-1246:
```python
use["big_change"] = np.where(
    (use["E_std_12"] > 0) & (use["E_delta_1"].abs() / use["E_std_12"] >= BIG_CHANGE_PERSONAL_Z),
    "変化大",
    "",
)
```

So "変化大" in current code means: **|E_delta_1| / E_std_12 >= 2.0** (personal 2-sigma change)

**But the spec says**: "変化大 includes > TREND_DELTA_STRONG (5.0)"

**These are different!**
- Current: Relative threshold (2σ personal)
- Spec: Absolute threshold (> 5.0)

**Question 2: Difference between Priority 3 and Priority 4 rules?**

Compare:
- Row 2 (Priority 3, 復活): change_tag=変化大, |E_slope_6|>threshold, |E_delta_1| included in 変化大
- Row 3 (Priority 4, 回復): change_tag=NaN, |E_slope_6|>threshold, |E_delta_1|>5.0

If 変化大 includes |E_delta_1|>5.0, then both require the same delta condition. The difference is:
- **復活**: Requires change_tag=変化大 (which might have additional meaning beyond just delta>5.0)
- **回復**: Just checks delta>5.0 directly, without requiring change_tag

**Possible interpretation**:
- If change_tag="変化大" (which includes delta>5.0 PLUS maybe other conditions like momentum) → 復活 (Priority 3, higher priority)
- If change_tag is not "変化大" but |E_delta_1|>5.0 → 回復 (Priority 4, lower priority)

**Question 3: trend_base = "横ばい" vs "安定"?**

Row 12 uses trend_base="横ばい", but current code doesn't generate this value for trend_base.

Current code (line 476):
```python
df_sorted["Trend_B_base"] = base  # Can be: "安定", "上昇中", "低下中", "未評価"
```

**Issue**: Spec uses "横ばい" for trend_base, but code doesn't produce it.

**Likely resolution**: "横ばい" = "安定" (they mean the same thing)

---

## 3. Comparison with Current Implementation

### 3.1 Current Constants

From we_analyzer.py lines 17-26:
```python
TREND_SLOPE_POS = 0.5
TREND_SLOPE_NEG = -0.5
TREND_DELTA_STRONG = 5.0
TREND_DELTA = 1.0
TREND_MOMENTUM_STRONG = 1.5  # Not used in updated spec
BIG_CHANGE_PERSONAL_Z = 2.0  # For personal 2σ threshold
```

### 3.2 Rule-by-Rule Comparison

#### Priority 1: 上昇加速

**Updated Spec:**
```
trend_recent in [上昇, 急上昇, 連続上昇]
AND trend_base == 上昇中
AND change_tag == 変化大
AND |E_slope_6| > TREND_SLOPE
AND |E_delta_1| > TREND_DELTA_STRONG (included in 変化大)
```

**Current Code (lines 554-564):**
```python
base == "上昇中"
AND recent in ("上昇", "急上昇", "連続上昇")
AND slope_val > TREND_SLOPE_POS  # 0.5
AND d1 > TREND_DELTA_STRONG  # 5.0
AND (strong_momentum_up OR consecutive_strong_up)
```
Where:
- `strong_momentum_up = mom > TREND_MOMENTUM_STRONG (1.5)`
- `consecutive_strong_up = d1_prev > TREND_DELTA_STRONG (5.0)`

**Differences:**
- Current checks **signed** slope (>0.5), spec uses absolute |E_slope_6|
- Current adds **momentum** condition (mom>1.5 OR previous delta>5.0)
- Spec may embed momentum in "変化大" definition

**Match?** Mostly aligned, but current has additional momentum check

---

#### Priority 2: 上昇継続

**Updated Spec:**
```
trend_recent in [上昇, 横ばい]
AND trend_base == 上昇中
AND change_tag == none
AND |E_slope_6| > TREND_SLOPE
```

**Current Code (lines 566-577):**
```python
base == "上昇中"
AND recent == "横ばい"  # ⚠️ ONLY 横ばい, not 上昇!
AND slope_val > TREND_SLOPE_POS
AND -TREND_MOMENTUM_STRONG < mom < TREND_MOMENTUM_STRONG
AND -TREND_DELTA_STRONG < d1 < TREND_DELTA_STRONG
```

**Differences:**
- **Critical**: Current ONLY checks recent="横ばい", but spec says "上昇 or 横ばい"
- Current adds momentum bounds check (moderate momentum)
- Current checks delta bounds (moderate delta, not strong)
- Spec requires change_tag=none (no big change)

**Match?** ❌ **NO** - Current missing the "上昇" case for 上昇継続

---

#### Priority 3: 復活

**Updated Spec:**
```
trend_recent in [上昇, 急上昇, 連続上昇]
AND trend_base == 低下中
AND change_tag == 変化大
AND |E_slope_6| > TREND_SLOPE
AND |E_delta_1| > TREND_DELTA_STRONG (in 変化大)
```

**Current Code (lines 620-628):**
```python
recovery = (
    base == "低下中" OR (base == "安定" AND prev_slope < TREND_SLOPE_NEG)
    AND recent in ("上昇", "急上昇", "連続上昇")
    AND d1 > TREND_DELTA_STRONG
    AND (strong_momentum_up OR consecutive_strong_up)
)
if recovery and current_e > max6:  # ⚠️ Historical comparison!
    return "復活"
```

**Differences:**
- Current uses **historical comparison** (current_e > E_max6_past) to distinguish 復活 vs 回復
- Spec uses **change_tag** (変化大) for distinction
- Current includes recovery from "安定" with negative slope
- Current adds momentum check

**Match?** ⚠️ **Different Logic** - Historical comparison vs change_tag

---

#### Priority 4: 回復

**Updated Spec:**
```
trend_recent in [上昇, 急上昇, 連続上昇]
AND trend_base == 低下中
AND |E_slope_6| > TREND_SLOPE
AND |E_delta_1| > TREND_DELTA_STRONG
(Note: change_tag is NaN, meaning don't check it)
```

**Current Code (lines 620-628):**
```python
recovery = (same as above)
if recovery and current_e <= max6:  # ⚠️ Historical comparison!
    return "回復"
```

**Differences:**
- Same as 復活 - uses historical comparison instead of change_tag distinction

**Match?** ⚠️ **Different Logic** - Historical comparison vs explicit delta check

---

#### Priority 5: 上昇期待

**Updated Spec:**
```
trend_recent in [上昇, 急上昇]
AND trend_base == 安定
AND |E_delta_1| ≦ TREND_DELTA_STRONG
```

**Current Code (lines 634-644):**
```python
base == "安定"
AND recent in ("上昇", "急上昇")
AND -TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS
AND d1 > TREND_DELTA  # 1.0
AND (strong_momentum_up OR d1_prev < SHORT_MIN_DELTA)
```

**Differences:**
- Current checks slope is in moderate range (not too strong)
- Current requires d1 > 1.0, spec says d1 ≦ 5.0 (so 1.0 < d1 ≦ 5.0 range)
- Current adds momentum condition

**Match?** Partially - delta range is different

---

#### Priority 6: 低下懸念

**Updated Spec:**
```
trend_recent == 横ばい
AND trend_base == 上昇中
AND |E_delta_1| > TREND_DELTA (1.0)
```

**Current Code (lines 630-632):**
```python
base == "上昇中"
AND recent == "横ばい"
AND d1 < -TREND_DELTA  # < -1.0 (negative!)
```

**Differences:**
- Current checks **negative** delta (d1 < -1.0)
- Spec uses **absolute** value (|E_delta_1| > 1.0)

**Match?** ✅ Logically equivalent (both check for decline of > 1.0)

---

#### Priority 1: 入力疑義

**Updated Spec:**
```
flag_constant_6m == Y
(Highest priority - overrides everything)
```

**Current Code:**
```python
# NOT IMPLEMENTED!
# flag_constant_6m is computed (lines 862-895) but never used
```

**Match?** ❌ **MISSING** - Not implemented at all

---

#### Priority 7: Catch-all for 未評価

**Updated Spec:**
```
Row 13: trend_recent in [上昇, 急上昇] AND trend_base in [未評価, 安定] → 上昇
Row 14: trend_recent in [下降, 急落] AND trend_base in [未評価, 安定] → 下降
Row 15: trend_recent == 横ばい AND trend_base in [未評価, 安定] → 横ばい
```

**Current Code (lines 537-540, 661-666):**
```python
if base == "未評価":
    if recent in {上昇, 下降, 横ばい, 急上昇, 急落, 連続上昇, 連続下降}:
        return recent
    return "未評価"

# Also has catch-alls for 安定 at lines 662-666
if base == "安定" and not has_slope:
    if recent in ("上昇", "急上昇"):
        return "上昇期待"
    if recent in ("下降", "急落"):
        return "低下警戒"
    return "安定維持"
```

**Differences:**
- Current returns the actual trend_recent value for 未評価
- Spec maps to simplified values (上昇, 下降, 横ばい)
- Spec combines 未評価 and 安定 for Priority 7 rules

**Match?** Mostly aligned

---

#### Priority 9: 安定維持

**Updated Spec:**
```
trend_recent == 横ばい
AND trend_base == 横ばい  (probably means 安定)
AND change_tag == none
```

**Current Code (line 672):**
```python
# Final fallback
return "安定維持"
```

**Match?** ⚠️ Current doesn't check conditions explicitly, just uses as default

---

## 4. Summary of Differences

### 4.1 Critical Differences

| Issue | Current Code | Updated Spec | Impact |
|-------|--------------|--------------|--------|
| **回復 vs 復活 distinction** | Uses historical comparison (E vs E_max6_past) | Uses change_tag (変化大) | Different results |
| **悪化 vs 低下危機 distinction** | Uses historical comparison (E vs E_min6_past) | Uses change_tag (変化大) | Different results |
| **上昇継続 condition** | Only recent="横ばい" | recent in [上昇, 横ばい] | Missing case |
| **入力疑義** | Not implemented | Priority 1 - highest | Missing feature |
| **Momentum checks** | Uses E_momentum_3 extensively | Not mentioned (removed) | Simpler logic |

### 4.2 Missing Constants Clarification

The spec references these constants that need mapping:

| Spec Constant | Current Code | Value |
|---------------|--------------|-------|
| TREND_SLOPE | TREND_SLOPE_POS | 0.5 |
| TREND_DELTA_STRONG | TREND_DELTA_STRONG | 5.0 |
| TREND_DELTA | TREND_DELTA | 1.0 |

### 4.3 change_tag Definition Needed

**Critical Question**: What exactly is "変化大"?

**Option A**: Absolute threshold
```python
change_tag = "変化大" if abs(E_delta_1) > TREND_DELTA_STRONG else "none"
```

**Option B**: Personal 2-sigma (current code)
```python
change_tag = "変化大" if abs(E_delta_1) / E_std_12 >= 2.0 else "none"
```

**Option C**: Combined condition (absolute OR relative)
```python
change_tag = "変化大" if (abs(E_delta_1) > TREND_DELTA_STRONG OR
                          abs(E_delta_1) / E_std_12 >= 2.0) else "none"
```

**Recommendation**: Based on spec note "変化大 includes > TREND_DELTA_STRONG", suggest **Option A** for simplicity.

---

## 5. Coverage Analysis

### 5.1 Are All Cases Covered?

Let me check systematically:

**trend_base × trend_recent matrix:**

| trend_base ↓ / trend_recent → | 上昇系 (上昇/急上昇/連続上昇) | 下降系 (下降/急落/連続下降) | 横ばい |
|------------------------------|---------------------------|---------------------------|--------|
| **上昇中** | ✅ P1:上昇加速 or P2:上昇継続 | ✅ P3:悪化 or P4:低下危機 | ✅ P6:低下懸念 or P2:上昇継続 |
| **低下中** | ✅ P3:復活 or P4:回復 | ✅ P1:低下加速 or P2:低下継続 | ✅ P6:回復期待 or P2:低下継続 |
| **安定** | ✅ P5:上昇期待 or P7:上昇 | ✅ P5:低下警戒 or P7:下降 | ✅ P7:横ばい or P9:安定維持 |
| **未評価** | ✅ P7:上昇 | ✅ P7:下降 | ✅ P7:横ばい |

**Plus**: P1:入力疑義 (flag_constant_6m=Y) overrides all

**Result**: ✅ **All combinations covered**

### 5.2 Priority Conflicts

Some cells have multiple rules. These are resolved by priority:

**Example 1**: 上昇中 + 上昇
- If 変化大 + |E_slope_6|>threshold → P1:上昇加速
- If none + |E_slope_6|>threshold → P2:上昇継続
- **Resolved by**: change_tag value

**Example 2**: 上昇中 + 横ばい
- If none + |E_slope_6|>threshold → P2:上昇継続
- If |E_delta_1|>1.0 → P6:低下懸念
- **Question**: Can these both be true? Yes if |E_slope_6|>0.5 but |E_delta_1|>1.0 (negative delta despite positive slope)
- **Resolved by**: Priority 2 > Priority 6

**Example 3**: 低下中 + 上昇
- If 変化大 + |E_slope_6|>threshold → P3:復活
- If |E_slope_6|>threshold + |E_delta_1|>5.0 → P4:回復
- **Question**: If 変化大 includes |E_delta_1|>5.0, then P3 is more restrictive
- **Resolved by**: Priority (P3 checks first)

**Conclusion**: Priority ordering prevents conflicts. ✅ **Logic is consistent**

---

## 6. Implementation Recommendations

### 6.1 Required Changes

1. **Add 入力疑義 detection (Priority 1)**
   ```python
   if flag_constant_6m:
       return "入力疑義"
   ```

2. **Fix 上昇継続 to include "上昇"**
   ```python
   # Current only checks recent == "横ばい"
   # Should be: recent in ("上昇", "横ばい")
   ```

3. **Replace historical comparison with change_tag**
   - Remove E_min6_past / E_max6_past logic
   - Use change_tag for 回復/復活 and 悪化/低下危機 distinction

4. **Remove E_momentum_3 checks** (as per your note that momentum is hard to handle)
   - Simplify conditions to use only slope and delta

5. **Define change_tag clearly**
   ```python
   # Option A (Simple absolute threshold):
   change_tag = "変化大" if abs(E_delta_1) > TREND_DELTA_STRONG else "none"

   # Option B (Keep personal 2-sigma):
   change_tag = "変化大" if (E_std_12 > 0 and
                             abs(E_delta_1) / E_std_12 >= 2.0) else "none"
   ```

6. **Use absolute value for slope checks**
   - Spec uses |E_slope_6|, but current code has signed slope
   - Need to clarify: should we use abs() or keep signed?

### 6.2 Pseudo-code for New Logic

```python
def trend_refined_from_updated_spec(row):
    trend_recent = row["Trend_B_recent"]
    trend_base = row["Trend_B_base"]
    E_slope_6 = row["E_slope_6"]
    E_delta_1 = row["E_delta_1"]
    flag_constant_6m = row["flag_constant_6m"]

    # Define change_tag (need to decide on definition)
    if abs(E_delta_1) > TREND_DELTA_STRONG:
        change_tag = "変化大"
    else:
        change_tag = "none"

    # Helper: Map trend_recent to categories
    up_trends = ["上昇", "急上昇", "連続上昇"]
    down_trends = ["下降", "急落", "連続下降"]

    # Priority 1: 入力疑義 (highest priority)
    if flag_constant_6m:
        return "入力疑義"

    # Priority 1: 上昇加速
    if (trend_recent in up_trends and
        trend_base == "上昇中" and
        change_tag == "変化大" and
        abs(E_slope_6) > TREND_SLOPE_POS):
        return "上昇加速"

    # Priority 1: 低下加速
    if (trend_recent in down_trends and
        trend_base == "低下中" and
        change_tag == "変化大" and
        abs(E_slope_6) > TREND_SLOPE_POS):
        return "低下加速"

    # Priority 2: 上昇継続
    if (trend_recent in ["上昇", "横ばい"] and
        trend_base == "上昇中" and
        change_tag == "none" and
        abs(E_slope_6) > TREND_SLOPE_POS):
        return "上昇継続"

    # Priority 2: 低下継続
    if (trend_recent in ["下降", "横ばい"] and
        trend_base == "低下中" and
        change_tag == "none" and
        abs(E_slope_6) > TREND_SLOPE_POS):
        return "低下継続"

    # Priority 3: 復活
    if (trend_recent in up_trends and
        trend_base == "低下中" and
        change_tag == "変化大" and
        abs(E_slope_6) > TREND_SLOPE_POS):
        return "復活"

    # Priority 3: 悪化
    if (trend_recent in down_trends and
        trend_base == "上昇中" and
        change_tag == "変化大" and
        abs(E_slope_6) > TREND_SLOPE_POS):
        return "悪化"

    # Priority 4: 回復
    if (trend_recent in up_trends and
        trend_base == "低下中" and
        abs(E_slope_6) > TREND_SLOPE_POS and
        abs(E_delta_1) > TREND_DELTA_STRONG):
        return "回復"

    # Priority 4: 低下危機
    if (trend_recent in down_trends and
        trend_base == "上昇中" and
        abs(E_slope_6) > TREND_SLOPE_POS and
        abs(E_delta_1) > TREND_DELTA_STRONG):
        return "低下危機"

    # Priority 5: 上昇期待
    if (trend_recent in ["上昇", "急上昇"] and
        trend_base == "安定" and
        abs(E_delta_1) <= TREND_DELTA_STRONG):
        return "上昇期待"

    # Priority 5: 低下警戒
    if (trend_recent in ["下降", "急落"] and
        trend_base == "安定" and
        abs(E_delta_1) <= TREND_DELTA_STRONG):
        return "低下警戒"

    # Priority 6: 低下懸念
    if (trend_recent == "横ばい" and
        trend_base == "上昇中" and
        abs(E_delta_1) > TREND_DELTA):
        return "低下懸念"

    # Priority 6: 回復期待
    if (trend_recent == "横ばい" and
        trend_base == "低下中" and
        abs(E_delta_1) > TREND_DELTA):
        return "回復期待"

    # Priority 7: Catch-all for 未評価 or 安定
    if trend_base in ["未評価", "安定"]:
        if trend_recent in ["上昇", "急上昇"]:
            return "上昇"
        if trend_recent in ["下降", "急落"]:
            return "下降"
        if trend_recent == "横ばい":
            return "横ばい"

    # Priority 9: 安定維持
    if (trend_recent == "横ばい" and
        trend_base in ["安定", "横ばい"] and
        change_tag == "none"):
        return "安定維持"

    # Fallback
    return "未分類"
```

### 6.3 Key Questions for Clarification

1. **change_tag definition**: Absolute threshold (|E_delta_1| > 5.0) or personal 2-sigma?

2. **|E_slope_6| usage**: Should we use abs(E_slope_6) or keep signed slope with appropriate comparisons?

3. **trend_base="横ばい"**: Is this equivalent to "安定"? If so, should we map it in the code?

4. **Momentum removal**: Confirm that all E_momentum_3 and E_momentum_6 checks should be removed from trend_refined logic?

5. **Priority 3 vs Priority 4 overlap**:
   - Both 復活 and 回復 require |E_delta_1| > 5.0
   - Is the distinction that 復活 requires change_tag="変化大" which might include OTHER conditions beyond just delta>5.0?
   - Or should 回復 be for cases where delta>5.0 but change_tag is not "変化大" (if using personal 2-sigma definition)?

---

## 7. Validation Test Cases

To ensure the new logic works correctly, test these cases:

| Test # | trend_recent | trend_base | E_slope_6 | E_delta_1 | E_std_12 | Expected Result |
|--------|--------------|------------|-----------|-----------|----------|-----------------|
| 1 | 急上昇 | 上昇中 | 0.6 | 6.0 | 3.0 | 上昇加速 |
| 2 | 上昇 | 上昇中 | 0.6 | 2.0 | 3.0 | 上昇継続 |
| 3 | 横ばい | 上昇中 | 0.6 | 0.5 | 3.0 | 上昇継続 |
| 4 | 急上昇 | 低下中 | 0.6 | 6.0 | 3.0 | 復活 |
| 5 | 急上昇 | 低下中 | 0.6 | 5.5 | 2.0 | 回復 |
| 6 | 上昇 | 安定 | 0.2 | 2.0 | 3.0 | 上昇期待 |
| 7 | 横ばい | 上昇中 | 0.6 | 1.5 | 3.0 | 低下懸念 |
| 8 | 横ばい | 低下中 | -0.6 | 1.5 | 3.0 | 回復期待 |
| 9 | 上昇 | 未評価 | 0.1 | 0.5 | - | 上昇 |
| 10 | 横ばい | 安定 | 0.0 | 0.0 | - | 安定維持 |
| 11 | (any) | (any) | (any) | (any) | - | 入力疑義 (if flag_constant_6m=Y) |

---

## 8. Conclusion

The updated specification is **much clearer and simpler** than the previous version:

✅ **Strengths:**
- Removed hard-to-interpret E_momentum_6
- Removed historical min/max comparison
- Clear priority-based decision tree
- Explicit conditions using slope and delta

⚠️ **Need Clarification:**
- Exact definition of "変化大" (change_tag)
- Whether to use abs(E_slope_6) or signed slope
- trend_base="横ばい" mapping to "安定"
- Priority 3 vs 4 distinction (復活/回復, 悪化/低下危機)

❌ **Implementation Gaps:**
- 入力疑義 not implemented
- 上昇継続 missing "上昇" case
- Historical comparison logic needs replacement

**Next Steps:**
1. Clarify the remaining questions
2. Update implementation to match spec
3. Test with validation cases
4. Verify outputs match expectations
