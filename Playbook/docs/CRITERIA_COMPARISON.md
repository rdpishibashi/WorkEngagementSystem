# Criteria Comparison: evaluation.gs vs we_analyzer.py

## Summary of Findings

This document compares the comparison operators and criteria between `evaluation.gs` and `we_analyzer.py`.

---

## 1. MID_MIN_RECORDS (未評価 Criteria)

### evaluation.gs
```javascript
// Line 24
const MID_MIN_RECORDS = 2;

// Line 151
const hasMidHistory = rows.length > MID_MIN_RECORDS;  // > 2, needs 3+

// Lines 328-329
} else {
  metric.trend_base = "未評価";
}
```

**Result:** "未評価" when `rows.length ≤ 2`

### we_analyzer.py
```python
# Line 56
MID_MIN_RECORDS = 2

# Lines 967-968
counts = df_sorted.groupby(PERSON_COL, sort=False)[PERSON_COL].transform("size")
has_mid_history = counts > MID_MIN_RECORDS  # > 2, needs 3+

# Line 982
base[~has_mid_history] = "未評価"
```

**Result:** "未評価" when `counts ≤ 2`

**Status:** ✓ **IDENTICAL** - Both use `> 2` (i.e., ≤ 2 is "未評価")

**User Requirement:** "The count of waves ≤ 2 is 未評価" ✓ **MATCHES**

---

## 2. Level Classification

### evaluation.gs (lines 408-416)
```javascript
function levelFromEngagement(value) {
  if (!Number.isFinite(value)) return "";
  if (value > LEVEL_THRIVING) return "Thriving";     // > 43
  if (value < LEVEL_CRITICAL) return "Critical";     // < 3
  if (value > LEVEL_HIGH) return "High";             // > 32
  if (value < LEVEL_LOW) return "Low";               // < 11
  return "Moderate";
}
```

### we_analyzer.py (lines 295-315)
```python
def _level_from_e(val: float) -> str:
    if pd.isna(val):
        return ""
    if val > LEVEL_THRIVING:     # > 43
        return "Thriving"
    if val < LEVEL_CRITICAL:     # < 3
        return "Critical"
    if val > LEVEL_HIGH:         # > 32
        return "High"
    if val < LEVEL_LOW:          # < 11
        return "Low"
    return "Moderate"
```

**Status:** ✓ **IDENTICAL** - Both use strict inequalities (>, <) without equals

---

## 3. trend_base Classification

### evaluation.gs (lines 319-326)
```javascript
if ((Number.isFinite(slope) && slope > TREND_SLOPE &&
     Number.isFinite(slopeStd) && slopeStd > TREND_SLOPE_STD_MIN) ||
    (Number.isFinite(slopeStd) && slopeStd > TREND_SLOPE_STD)) {
  metric.trend_base = "上昇中";
} else if ((Number.isFinite(slope) && slope < -TREND_SLOPE &&
            Number.isFinite(slopeStd) && slopeStd < -TREND_SLOPE_STD_MIN) ||
           (Number.isFinite(slopeStd) && slopeStd < -TREND_SLOPE_STD)) {
  metric.trend_base = "低下中";
```

### we_analyzer.py (lines 987-995)
```python
base[
    (mid_mask & (slope > TREND_SLOPE) & (slope_std > TREND_SLOPE_STD_MIN))
    | ((slope_std.notna()) & (slope_std > TREND_SLOPE_STD))
] = "上昇中"

base[
    (mid_mask & (slope < -TREND_SLOPE) & (slope_std < -TREND_SLOPE_STD_MIN))
    | ((slope_std.notna()) & (slope_std < -TREND_SLOPE_STD))
] = "低下中"
```

**Status:** ✓ **IDENTICAL** - Both use strict inequalities (>, <) without equals

---

## 4. trend_recent Classification

### evaluation.gs (lines 343-362)
```javascript
const acuteUp = Number.isFinite(delta) && delta >= acuteThr;        // >= 6.0
const acuteDown = Number.isFinite(delta) && delta <= -acuteThr;     // <= -6.0

const moderateUp = Number.isFinite(delta) && delta > recentThr && delta < acuteThr;
const moderateDown = Number.isFinite(delta) && delta < -recentThr && delta > -acuteThr;

const upPrev = Number.isFinite(deltaPrev) && deltaPrev > recentThr;
const downPrev = Number.isFinite(deltaPrev) && deltaPrev < -recentThr;
const consecutiveUp = Number.isFinite(delta) && delta > recentThr && upPrev;
const consecutiveDown = Number.isFinite(delta) && delta < -recentThr && downPrev;
```

### we_analyzer.py (lines 1021-1042)
```python
acute_up = delta_vals >= acute_thr        # >= 6.0
acute_down = delta_vals <= -acute_thr     # <= -6.0

moderate_up = (delta_vals > recent_thr) & (delta_vals < acute_thr)
moderate_down = (delta_vals < -recent_thr) & (delta_vals > -acute_thr)

up_prev = delta_prev_vals > recent_thr
down_prev = delta_prev_vals < -recent_thr

consecutive_up = (delta_vals > recent_thr) & up_prev
consecutive_down = (delta_vals < -recent_thr) & down_prev
```

**Status:** ✓ **IDENTICAL**
- Acute: Uses `>=` and `<=` (includes equals)
- Moderate/Consecutive: Uses `>` and `<` (strict)

---

## 5. Stability Classification

### evaluation.gs (lines 297-308)
```javascript
const stableFlag = Number.isFinite(stdVal) &&
                   stdVal < STABILITY_STD_STABLE &&           // < 1.0
                   absMomentum < STABILITY_MOMENTUM_STABLE;   // < 0.5
const unstableFlag = Number.isFinite(stdVal) &&
                     stdVal > STABILITY_STD_UNSTABLE;         // > 3.3
```

### we_analyzer.py (lines 1088-1089)
```python
stable_flag = (std_flag < STABILITY_STD_STABLE) & (abs_momentum < STABILITY_MOMENTUM_STABLE)
unstable_flag = std_flag > STABILITY_STD_UNSTABLE
```

**Status:** ✓ **IDENTICAL** - Both use strict inequalities (<, >) without equals

---

## 6. Short-term Strength/Weakness

### evaluation.gs (lines 257-261)
```javascript
if (Number.isFinite(deltaValue) && deltaValue >= SHORT_MIN_DELTA) {  // >= 2.0
  shortStrengthLists[i].push(dim.label);
}
if (Number.isFinite(deltaValue) && deltaValue <= -SHORT_MIN_DELTA) { // <= -2.0
  shortWeaknessLists[i].push(dim.label);
}
```

### we_analyzer.py (lines 524-548)
```python
# Uses expanding quantiles and Z-scores - COMPLETELY DIFFERENT APPROACH
p90 = df.groupby(PERSON_COL, sort=False)[dcol].apply(
    lambda s: _expanding_quantile_exclusive(s, 0.90)
).reset_index(level=0, drop=True)
p10 = ...
z = ...

th_pos = pd.Series(np.maximum(p90.values, min_delta), index=df.index)
th_neg = pd.Series(np.minimum(p10.values, -min_delta), index=df.index)

pos = (df[dcol] >= th_pos) & (z.isna() | (z.abs() > Z_VDA_THRESHOLD))  # >= threshold
neg = (df[dcol] <= th_neg) & (z.isna() | (z.abs() > Z_VDA_THRESHOLD))  # <= threshold
```

**Status:** ⚠️ **DIFFERENT LOGIC**
- evaluation.gs: Simple fixed threshold with `>=` and `<=`
- we_analyzer.py: Dynamic threshold based on personal history with `>=` and `<=`
- **Both use inclusive comparisons (>=, <=)** when comparing to thresholds

---

## 7. Mid-term Strength/Weakness

### evaluation.gs (lines 265-269)
```javascript
if (hasMidHistory && Number.isFinite(slopeValue) && slopeValue >= MIN_SLOPE_POS) {  // >= 0.20
  midStrengthLists[i].push(dim.label);
}
if (hasMidHistory && Number.isFinite(slopeValue) && slopeValue <= MIN_SLOPE_NEG) {  // <= -0.20
  midWeaknessLists[i].push(dim.label);
}
```

### we_analyzer.py (lines 551-577)
```python
# Uses expanding quantiles and Z-scores - COMPLETELY DIFFERENT APPROACH
th_pos_s = pd.Series(np.maximum(p90s.values, MIN_SLOPE), index=df.index)
th_neg_s = pd.Series(np.minimum(p10s.values, -MIN_SLOPE), index=df.index)

posm = slope.notna() & (slope >= th_pos_s) & (zs.isna() | (zs.abs() > Z_VDA_THRESHOLD))  # >= threshold
negm = slope.notna() & (slope <= th_neg_s) & (zs.isna() | (zs.abs() > Z_VDA_THRESHOLD))  # <= threshold
```

**Status:** ⚠️ **DIFFERENT LOGIC**
- evaluation.gs: Simple fixed threshold with `>=` and `<=`
- we_analyzer.py: Dynamic threshold based on personal history with `>=` and `<=`
- **Both use inclusive comparisons (>=, <=)** when comparing to thresholds

---

## 8. trend_refined Logic

### evaluation.gs (lines 458-559)
```javascript
// Priority 2: 上昇加速
if (upTrends.includes(recent) &&
    base === "上昇中" &&
    changeTag === "変化大" &&
    Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {  // > 0.5
  return "上昇加速";
}

// Priority 3: 上昇継続
if (["上昇", "急上昇", "連続上昇", "横ばい"].includes(recent) &&
    base === "上昇中" &&
    changeTag === "not 変化大" &&
    Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE &&      // > 0.5
    Number.isFinite(delta) && delta >= 0) {                         // >= 0
  return "上昇継続";
}
```

### we_analyzer.py (lines 849-879)
```python
# Priority 1: 上昇加速
if (trend_recent in up_trends and
    trend_base == "上昇中" and
    change_tag == "変化大" and
    pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):  # > 0.5
    return "上昇加速"

# Priority 2: 上昇継続
if (trend_recent in ["上昇", "急上昇", "連続上昇", "横ばい"] and
    trend_base == "上昇中" and
    change_tag == "not 変化大" and
    pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE and  # > 0.5
    pd.notna(E_delta_1) and E_delta_1 >= 0):                  # >= 0
    return "上昇継続"
```

**Status:** ✓ **IDENTICAL** - Same logic and operators

**Note:** evaluation.gs has no "入力疑義" detection, but we_analyzer.py does (Priority 1)

---

## Key Findings

### 1. Comparison Operators - CONSISTENT
Both evaluation.gs and we_analyzer.py use:
- **Strict inequalities (>, <)** for: level, trend_base, stability, most trend_recent
- **Inclusive inequalities (>=, <=)** for: acute changes (trend_recent), strength/weakness thresholds

### 2. Logic Differences - DIFFERENT APPROACHES

**evaluation.gs:**
- Simple fixed thresholds for short/mid strength/weakness
- No "入力疑義" (input suspect) detection

**we_analyzer.py:**
- **Adaptive thresholds** based on personal history (expanding quantiles + Z-scores)
- **Includes "入力疑義" detection** (flag_constant_6m)
- More sophisticated personal-level analysis

### 3. Why 21 "未評価" Differences?

Both use `count > 2` for has_mid_history, so "未評価" occurs when count ≤ 2.

The 21 differences suggest these people have:
- **Exactly 3 records in evaluation.gs** (just barely > 2) but are evaluated
- **Different data availability** in the two systems

**Action Required:** Verify that both systems are reading the same historical data.

---

## Recommendation

**User Preference:** "I prefer we_analyzer.py"

### What we_analyzer.py does better:
1. ✓ **Adaptive thresholds** - More personalized analysis
2. ✓ **Input suspect detection** - Better data quality control
3. ✓ **Consistent with user requirements** - Uses correct "未評価" criteria (count ≤ 2)

### Confirmed:
- ✓ "入力疑義" detection is **correct** and **valuable** (user confirmed: Yes)
- ✓ "未評価" criteria matches user requirement: count ≤ 2

### Next Step:
Update we_analyzer.py to:
1. ✓ Keep current logic (already correct)
2. Update default input file name to "EngagementMasterSS.xlsx"
3. Update default sheet name to "rating2"
4. Update column mappings to match new format
