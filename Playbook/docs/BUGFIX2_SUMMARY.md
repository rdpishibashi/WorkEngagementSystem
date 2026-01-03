# Bug Fix #2: mid_strength/weakness for People with ≤2 Waves

**Date:** 2026-01-03
**Issue:** People with ≤2 waves had mid_strength/weakness values when they should be empty
**Status:** ✓ FIXED (we_analyzer.py only - evaluation.gs already correct)

---

## Problem Description

### Reported Issue
People with 2 or fewer waves should have **empty** `mid_strength` and `mid_weakness`, but some had values like "V, D, A".

**Example:**
- **kengo_tsutsumi@ulvac.com** has 2 waves
- **Expected:** mid_strength = "" (empty)
- **Actual (before fix):** mid_strength = "V, D, A"
- **Note:** All slope values (V_slope_6, D_slope_6, A_slope_6) were correctly NaN

### Root Cause

**Execution Order Issue in we_analyzer.py:**

1. **Line 1826:** `overwrite_short_mid_personal()` is called
   - Creates `C_mid_strength` and `C_mid_weakness` for ALL people
   - Doesn't know about `has_mid_history` (calculated later)
   - Can set values even for people with ≤2 waves

2. **Line 1828:** `apply_personal_trend_logic()` is called
   - Calculates `has_mid_history = count > 2`
   - **Lines 999-1004:** Sets slope columns to NaN for `~has_mid_history`
   - **BUT:** Doesn't clear `C_mid_strength` / `C_mid_weakness`!

3. **Result:** mid_strength contains values even though:
   - Person has ≤2 waves
   - All slopes are NaN
   - Should be empty

### Why evaluation.gs is Correct

evaluation.gs processes each person sequentially and calculates `hasMidHistory` BEFORE computing mid-term strength/weakness:

```javascript
// Line 151: Calculate hasMidHistory first
const hasMidHistory = rows.length > MID_MIN_RECORDS;

// Line 283: Only calculate if hasMidHistory
if (hasMidHistory) {
  // Mid-term calculation...
  if (slopeValue >= thresholdPosMid) {
    midStrengthLists[i].push(dim.label);
  }
}

// Lines 302-303: Set to empty if !hasMidHistory
metrics[i].strength_mid = hasMidHistory ? midStrengthLists[i].join(", ") : "";
metrics[i].weakness_mid = hasMidHistory ? midWeaknessLists[i].join(", ") : "";
```

---

## The Fix

**File:** `we_analyzer.py` lines 1006-1010

Added clearing of mid_strength/weakness columns for people without mid history:

**Before (lines 999-1004):**
```python
# 履歴不足の人は傾き系指標を NaN に
slope_cols = ["E_slope_6", "E_slope_12", "E_slope_6_std_12", "E_accel_6",
              "V_slope_6", "D_slope_6", "A_slope_6"]
for col in slope_cols:
    if col in df_sorted.columns:
        df_sorted.loc[~has_mid_history, col] = np.nan
```

**After (lines 999-1010):**
```python
# 履歴不足の人は傾き系指標を NaN に
slope_cols = ["E_slope_6", "E_slope_12", "E_slope_6_std_12", "E_accel_6",
              "V_slope_6", "D_slope_6", "A_slope_6"]
for col in slope_cols:
    if col in df_sorted.columns:
        df_sorted.loc[~has_mid_history, col] = np.nan

# 履歴不足の人は mid_strength/weakness も空に
mid_str_cols = ["C_mid_strength", "C_mid_weakness"]
for col in mid_str_cols:
    if col in df_sorted.columns:
        df_sorted.loc[~has_mid_history, col] = ""
```

**Change:** Added clearing of `C_mid_strength` and `C_mid_weakness` to empty string for people with ≤2 waves.

---

## Impact Analysis

### People Affected (2025-12 data)

**Total people with ≤2 waves:** 24
**All 24 now have:** mid_strength = "" (empty), mid_weakness = "" (empty)

### Example: kengo_tsutsumi@ulvac.com

**Before Fix:**
```
wave     engagement  short_strength  mid_strength  V_slope_6  D_slope_6  A_slope_6
2025-11          9             NaN       V, D, A        NaN        NaN        NaN
2025-12         15            D, A       V, D, A        NaN        NaN        NaN
```

**After Fix:**
```
wave     engagement  short_strength  mid_strength  V_slope_6  D_slope_6  A_slope_6
2025-11          9             NaN           NaN        NaN        NaN        NaN
2025-12         15            D, A           NaN        NaN        NaN        NaN
```

**Notes:**
- ✓ mid_strength now correctly empty (NaN)
- ✓ short_strength still works (based on deltas, not slopes)
- ✓ All slope values remain NaN (correct for ≤2 waves)

---

## Verification

### Test Results

✓ **All 24 people with ≤2 waves now have empty mid_strength/weakness**
✓ **kengo_tsutsumi@ulvac.com correctly shows:**
  - Wave 2025-12: mid_strength = NaN (empty) ✓
  - Wave 2025-12: mid_weakness = NaN (empty) ✓
  - Wave 2025-12: short_strength = "D, A" (still works) ✓

### Logic Verification

```python
person_count = 2
MID_MIN_RECORDS = 2
has_mid_history = person_count > MID_MIN_RECORDS  # 2 > 2 = False ✓

# After fix:
df_sorted.loc[~has_mid_history, "C_mid_strength"] = ""  # ✓
df_sorted.loc[~has_mid_history, "C_mid_weakness"] = ""  # ✓
```

---

## Related to Bug Fix #1

This is the **second bug** related to the ≤2 waves condition:

1. **Bug #1 (trend_base):** People with ≤2 waves had trend_base = "上昇中"/"低下中" instead of "未評価"
   - **Fixed:** Added `has_mid_history &` check in trend_base conditions

2. **Bug #2 (mid_strength/weakness):** People with ≤2 waves had mid_strength/weakness values instead of empty
   - **Fixed:** Clear C_mid_strength/C_mid_weakness in apply_personal_trend_logic

Both bugs had the same root cause: **Missing has_mid_history checks**

---

## Files Updated

1. **`we_analyzer.py`**
   - Lines 1006-1010: Added clearing of C_mid_strength/C_mid_weakness
   - Function: `apply_personal_trend_logic()`

2. **`evaluation.gs`** - No changes needed (already correct)

---

## Summary

✓ **Bug identified and fixed in we_analyzer.py**
✓ **All 24 people with ≤2 waves now have empty mid_strength/weakness**
✓ **evaluation.gs already handles this correctly (no fix needed)**
✓ **Logic now consistent: wave count ≤ 2 → no mid-term evaluation**

**Combined with Bug Fix #1:**
- ✓ trend_base = "未評価" for people with ≤2 waves
- ✓ mid_strength = "" for people with ≤2 waves
- ✓ mid_weakness = "" for people with ≤2 waves
- ✓ All slope values = NaN for people with ≤2 waves

**Next Step:** Ready for production deployment.
