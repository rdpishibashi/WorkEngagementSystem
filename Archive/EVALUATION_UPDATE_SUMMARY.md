# evaluation.gs Update Summary

**Date:** 2026-01-03
**Status:** ✓ COMPLETED

---

## Changes Made to evaluation.gs

### 1. Added Helper Functions

Added three new utility functions to support adaptive thresholds:

**median(values)**
- Calculates the median of an array of values
- Handles NaN/infinite values automatically

**quantile(values, q)**
- Calculates quantile for a given probability q (0-1)
- Uses linear interpolation between data points

**expandingQuantileExclusive(series, q)**
- Calculates expanding quantile excluding current value
- Returns array shifted by 1 (first element is NaN)
- Mimics pandas `.expanding().quantile(q).shift(1)`

**expandingRobustZExclusive(series)**
- Calculates expanding robust Z-score using MAD (Median Absolute Deviation)
- MAD = median(|x - median(x)|) × 1.4826
- Excludes current value (shifted by 1)
- Returns NaN for first element and when MAD is too small

### 2. Updated Strength/Weakness Logic

**Previous Logic (Simple Fixed Thresholds):**
```javascript
// Short-term
if (deltaValue >= SHORT_MIN_DELTA) {  // >= 2.0
  shortStrengthLists[i].push(dim.label);
}

// Mid-term
if (slopeValue >= MIN_SLOPE_POS) {  // >= 0.20
  midStrengthLists[i].push(dim.label);
}
```

**New Logic (Adaptive Thresholds):**
```javascript
// Calculate expanding quantiles for each dimension
const deltaP90 = expandingQuantileExclusive(deltaSeries, 0.90);
const deltaP10 = expandingQuantileExclusive(deltaSeries, 0.10);
const deltaZ = expandingRobustZExclusive(deltaSeries);

// Adaptive threshold = max(p90, MIN_DELTA)
const thresholdPosShort = Math.max(deltaP90[i] || -Infinity, SHORT_MIN_DELTA);

// Flag if: value >= threshold AND (z is NaN OR |z| > Z_THRESHOLD)
if (Number.isFinite(deltaValue) && deltaValue >= thresholdPosShort &&
    (!Number.isFinite(deltaZ[i]) || Math.abs(deltaZ[i]) > Z_POS)) {
  shortStrengthLists[i].push(dim.label);
}
```

---

## Key Improvements

### 1. Personalized Thresholds
- **Before:** Everyone used the same fixed threshold (2.0 for deltas, 0.20 for slopes)
- **After:** Each person has adaptive thresholds based on their own history
  - Uses 90th/10th percentile of their historical values
  - Minimum threshold still applied (SHORT_MIN_DELTA = 2.0, MIN_SLOPE = 0.20)

### 2. Outlier Detection
- **Before:** No outlier detection
- **After:** Uses robust Z-score to avoid flagging statistical noise
  - Only flags if |Z-score| > 0.8 (or Z-score is NaN for early data)
  - Prevents flagging small changes in very stable individuals

### 3. Better for Different Profiles
- **High variance individuals:** Requires larger changes to flag
- **Low variance individuals:** Can flag smaller changes
- **New employees:** Falls back to minimum thresholds when history is insufficient

---

## Constants Used

```javascript
const SHORT_MIN_DELTA = 2.0;    // Minimum delta threshold (from SHORT_MIN_DELTA)
const MIN_SLOPE_POS = 0.20;      // Minimum positive slope threshold
const MIN_SLOPE_NEG = -0.20;     // Minimum negative slope threshold
const Z_POS = 0.8;               // Z-score threshold (positive)
const Z_NEG = -0.8;              // Z-score threshold (negative)
```

Note: The code uses the existing constants `SHORT_MIN_DELTA`, `MIN_SLOPE_POS`, and `Z_POS`/`Z_NEG` from evaluation.gs.

---

## Compatibility with we_analyzer.py

### Matching Logic
The updated evaluation.gs now uses the **exact same logic** as we_analyzer.py:

✓ Same expanding quantile calculation
✓ Same robust Z-score (MAD-based)
✓ Same threshold formula: `max(p90, min_threshold)`
✓ Same flagging criteria: `value >= threshold AND (z is NaN OR |z| > Z_THRESHOLD)`

### Expected Results
For 2025-12 data, evaluation.gs should now produce:
- Same `strength_short` and `weakness_short` values as we_analyzer.py
- Same `strength_mid` and `weakness_mid` values as we_analyzer.py

---

## Testing

### Test Data
- Input: EngagementMasterSS.xlsx (rating2 sheet)
- Period: All waves, focus on 2025-12 for comparison
- People: 96 individuals in 2025-12

### Validation Method
1. Run evaluation.gs on sample person data
2. Compare with we_analyzer.py output for same person
3. Verify strength/weakness flags match

### Example Test Case
**Person:** akifumi_sano@ulvac.com
**Wave:** 2025-12

**Expected Output (from we_analyzer.py):**
- `short_strength`: "A"
- `short_weakness`: ""
- `mid_strength`: ""
- `mid_weakness`: ""

The updated evaluation.gs should produce identical results.

---

## Migration Notes

### For Admin Scripts
The updated evaluation.gs is **backward compatible** with existing code:
- Function signatures unchanged
- Return value structure unchanged
- Only internal calculation logic improved

### For Testing
To test the changes:
1. Deploy updated evaluation.gs to Google Apps Script project
2. Run evaluation on test data
3. Compare results with we_analyzer.py output
4. Verify 2025-12 results match

---

## Files Modified

1. **`Report/evaluate.gs`**
   - Added: `median()`, `quantile()`, `expandingQuantileExclusive()`, `expandingRobustZExclusive()`
   - Modified: Short/mid strength/weakness calculation logic (lines 242-305)
   - Total additions: ~95 lines

---

## Benefits

### 1. Consistency
- evaluation.gs and we_analyzer.py now use identical logic
- Ensures consistent results across Google Sheets and Python analysis
- Reduces maintenance burden (single source of truth for logic)

### 2. Accuracy
- Better handles individual variation
- Reduces false positives for stable individuals
- More sensitive to genuine changes

### 3. Robustness
- Uses median-based statistics (robust to outliers)
- Gracefully handles missing data
- Works well with limited history (falls back to minimum thresholds)

---

## Next Steps

1. **Test in Google Apps Script Environment**
   - Deploy to test project
   - Run on actual Google Sheets data
   - Verify no runtime errors

2. **Compare 2025-12 Results**
   - Run evaluation.gs on EngagementMasterSS data
   - Export results
   - Compare cell-by-cell with we_analyzer.py output

3. **Deploy to Production**
   - After validation, deploy to production GAS project
   - Update Admin scripts if needed
   - Document changes for team

---

## Code Quality

✓ Follows existing evaluation.gs code style
✓ Comprehensive comments added
✓ Helper functions well-documented
✓ No breaking changes to API
✓ Backward compatible

---

## Summary

The updated evaluation.gs now implements **adaptive, personalized thresholds** for strength/weakness detection, matching the sophisticated logic in we_analyzer.py. This ensures:

- **Consistency** across Google Sheets and Python analysis
- **Better accuracy** through personalized thresholds
- **Improved robustness** via median-based statistics

The changes are backward compatible and ready for testing.
