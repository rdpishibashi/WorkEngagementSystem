# Changes Implemented in we_analyzer.py

**Date**: 2026-01-05
**Purpose**: Improve metric sensitivity and remove unused field

## Summary of Changes

1. ✅ Removed E_slope_3m_ma3 (unused field)
2. ✅ Added E_slope_6_std_6 (new standardized slope metric)
3. ✅ Added E_delta_1_std_6 (new standardized delta metric)
4. ✅ Updated trend classification to use E_slope_6_std_6
5. ✅ Updated big_change classification to use E_delta_1_std_6
6. ✅ Adjusted thresholds for new metrics

---

## Detailed Changes

### 1. Constants Updated (Lines 22, 35)

**TREND_SLOPE_STD**: `0.45` → `0.55`
- Used for trend_base classification (上昇中/低下中)
- Scaled by 1.2x to account for E_slope_6_std_6 being larger than E_slope_6_std_12

**BIG_CHANGE_PERSONAL_Z**: `2.0` → `2.8`
- Used for big_change flag (変化大)
- Scaled by 1.4x to account for E_delta_1_std_6 being larger than E_delta_1_std_12

### 2. New Field: E_slope_6_std_6 (Lines 674, 709-714, 754)

**Location**: `add_multiscale_features()`

**Calculation**:
```python
# E_slope_6_std_6: 6-month slope standardized by 6-month std
std6 = float(np.nanstd(ep[-6:], ddof=0))
if pd.notna(s6) and pd.notna(std6) and std6 > 0:
    e_slope_6_std_6.append(float(s6 / std6))
else:
    e_slope_6_std_6.append(np.nan)
```

**Purpose**: Better alignment of slope and variability windows (both use 6 months)

**Added to output**: After E_slope_12, before E_slope_6_std_12

### 3. New Field: E_delta_1_std_6 (Lines 1893-1897)

**Location**: `run()`

**Calculation**:
```python
use["E_delta_1_std_6"] = np.where(
    use["E_std_6"] > 0,
    use["E_delta_1"] / use["E_std_6"],
    np.nan,
)
```

**Purpose**: Better reflect short-term volatility context

**Added to output**: After E_delta_1_prev, before E_delta_1_std_12

### 4. Trend Classification Updated (Line 989)

**Location**: `apply_personal_trend_logic()`

**Before**:
```python
slope_std = df_sorted["E_slope_6_std_12"]
```

**After**:
```python
slope_std = df_sorted["E_slope_6_std_6"]
```

**Impact**:
- More sensitive detection of 上昇中/低下中
- Uses consistent 6-month window
- Threshold adjusted to maintain similar classification rates

**Also updated** (Line 1009):
- Added E_slope_6_std_6 to slope_cols list for NaN masking

### 5. Big Change Classification Updated (Lines 1905-1909)

**Location**: `run()`

**Before**:
```python
use["big_change"] = np.where(
    (use["E_std_12"] > 0) & (use["E_delta_1"].abs() / use["E_std_12"] > BIG_CHANGE_PERSONAL_Z),
    "変化大",
    "",
)
```

**After**:
```python
use["big_change"] = np.where(
    (use["E_std_6"] > 0) & (use["E_delta_1"].abs() / use["E_std_6"] > BIG_CHANGE_PERSONAL_Z),
    "変化大",
    "",
)
```

**Impact**:
- More sensitive to recent month-to-month changes
- Uses recent volatility context (6 months vs 12 months)
- Threshold adjusted to maintain similar flagging rate

### 6. E_slope_3m_ma3 Removed

**Locations**:
- Line 1409: Updated function docstring
- Lines 1438-1439: Removed calculation code
- Line 1457: Removed from output dictionary
- Line 1949: Removed from monthly_cols
- Line 2003: Removed from float_keys

**Rationale**: Not used by any other calculations or decision logic

---

## Output File Changes

### Column Order (we_report.xlsx)

**E_delta fields** (after E_delta_1_prev):
```
E_delta_1_prev
E_delta_1_std_6      ← NEW
E_delta_1_std_12     (existing)
```

**E_slope fields** (after E_slope_12):
```
E_slope_12
E_slope_6_std_6      ← NEW
E_slope_6_std_12     (existing)
```

**E_slope_3m fields**:
```
E_slope_3m           (kept)
E_slope_3m_ma3       ← REMOVED
```

### Columns Removed
- E_slope_3m_ma3

### Columns Added
- E_slope_6_std_6
- E_delta_1_std_6

**Net change**: +1 column (2 added, 1 removed)

---

## Behavioral Changes

### 1. trend_base Classification

**Expected changes**:
- Slightly more people classified as "上昇中" or "低下中"
- Slightly fewer people classified as "安定"
- Overall distribution should remain similar due to threshold adjustment

**Monitoring**:
```python
# Compare before/after
old_data['trend_base'].value_counts(normalize=True)
new_data['trend_base'].value_counts(normalize=True)
```

### 2. big_change Flag

**Expected changes**:
- Slightly more sensitive to recent changes
- Similar % of people flagged as "変化大" due to threshold adjustment

**Monitoring**:
```python
# Compare flagging rate
(old_data['big_change'] == '変化大').mean()
(new_data['big_change'] == '変化大').mean()
```

### 3. No Changes to Pattern Classification

**slope3m_pattern still uses E_slope_6_std_12** - intentionally left unchanged to minimize risk

---

## Validation Checklist

After running the updated script:

- [ ] Check that E_slope_6_std_6 values are ~1.2-1.6x larger than E_slope_6_std_12
- [ ] Check that E_delta_1_std_6 values are ~1.2-1.6x larger than E_delta_1_std_12
- [ ] Verify trend_base distribution is similar to previous runs
- [ ] Verify big_change flagging rate is similar to previous runs
- [ ] Check for any new NaN values in E_slope_6_std_6 or E_delta_1_std_6
- [ ] Confirm E_slope_3m_ma3 is no longer in output
- [ ] Verify column order matches specification

## Files Modified

- `Playbook/we_analyzer.py` - All changes above

## Files Created

- `Playbook/docs/PROPOSED_CHANGES_ANALYSIS.md` - Pre-implementation analysis
- `Playbook/docs/CHANGES_IMPLEMENTED.md` - This file

---

## Rollback Plan

If unexpected issues occur:

1. Revert constants:
   - TREND_SLOPE_STD: 0.55 → 0.45
   - BIG_CHANGE_PERSONAL_Z: 2.8 → 2.0

2. Revert trend classification (line 989):
   - `slope_std = df_sorted["E_slope_6_std_6"]` → `df_sorted["E_slope_6_std_12"]`

3. Revert big_change (line 1905-1909):
   - Replace E_std_6 with E_std_12 in condition

4. The new fields (E_slope_6_std_6, E_delta_1_std_6) can remain - they're harmless if not used

5. To restore E_slope_3m_ma3:
   - Add calculation back in compute_monthly_metrics()
   - Add to output columns

---

## Testing Recommendations

1. **Run on recent data** (last 3 months)
2. **Compare key metrics**:
   - trend_base distribution
   - big_change rate
   - E_std_6/E_std_12 ratio (should be ~0.7-0.85)
3. **Check for anomalies**:
   - Unexpected NaN values
   - Extreme classification shifts
4. **Monitor for 1-2 months** before declaring success

## Notes

- All old fields (E_slope_6_std_12, E_delta_1_std_12) are retained for comparison
- This is a non-breaking change in terms of data compatibility
- Output file will have 2 additional columns
- Pattern classification intentionally left unchanged (still uses E_slope_6_std_12)
