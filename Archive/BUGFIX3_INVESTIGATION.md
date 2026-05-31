# Bug Investigation #3: mid_weakness Discrepancy for hiroki_hosono@ulvac.com

**Date:** 2026-01-03
**Issue:** we_analyzer.py outputs empty mid_weakness, but evaluation.gs outputs "V"
**Person:** hiroki_hosono@ulvac.com (16 waves)
**Status:** INVESTIGATING

---

## Data Summary

**hiroki_hosono@ulvac.com:**
- Wave count: 16 (has_mid_history = TRUE)
- Latest wave: 2025-12
- V_slope_6 for 2025-12: **-0.333333**

---

## Key Finding: Different Slope Calculation Logic

### we_analyzer.py Logic

**Function:** `_compute_personal_slope()` (lines 464-486)

```python
for i in range(len(vals)):
    segment = vals[max(0, i - window + 1):i + 1]
    if np.isfinite(segment).sum() < window:  # Requires AT LEAST 6 values
        out.append(np.nan)
    else:
        out.append(_theil_sen_slope_window(segment, window))
```

**Requirement:** Must have AT LEAST 6 finite values in the window, otherwise returns NaN.

**Result for hiroki_hosono:**
- Waves 1-5: NaN (less than 6 values)
- Wave 6+: Calculated slopes

### evaluation.gs Logic

**Function:** `theilSenSlope()` (lines 619-649)

```javascript
function theilSenSlope(values, maxWindow) {
  const filtered = values.filter(Number.isFinite);
  if (filtered.length === 0) {
    return 0;  // Returns 0, not NaN!
  }

  const n = slice.length;
  if (n < 2) {
    return 0;  // Returns 0 for < 2 values
  }
  if (n < 3) {
    return (slice[n - 1] - slice[0]) / (n - 1);  // Simple slope for 2 values
  }
  // Theil-Sen for 3+ values
}
```

**Requirement:** Can calculate slopes with as few as 2 values, returns 0 if < 2.

**Result for hiroki_hosono:**
- Wave 1: 0 (only 1 value)
- Waves 2-5: Simple or Theil-Sen slopes with 2-5 values
- Wave 6+: Full Theil-Sen slopes with 6 values

---

## Slope History Comparison

### evaluation.gs Slopes (all 16 waves calculated):

```
2024-08:  0.000000
2024-09: -1.000000
2024-10: -0.500000
2024-12: -0.583333
2025-01: -0.375000
2025-02:  0.000000
2025-03:  0.000000
2025-04:  0.000000
2025-05:  0.000000
2025-06:  0.000000
2025-07: -0.333333
2025-08:  0.000000
2025-09:  0.333333
2025-10:  0.400000
2025-11:  0.000000
2025-12: -0.333333
```

### we_analyzer.py Slopes (first 5 are NaN):

```
2024-08: NaN
2024-09: NaN
2024-10: NaN
2024-12: NaN
2025-01: NaN
2025-02:  0.000000
2025-03:  0.000000
2025-04:  0.000000
2025-05:  0.000000
2025-06:  0.000000
2025-07: -0.333333
2025-08:  0.000000
2025-09:  0.333333
2025-10:  0.400000
2025-11:  0.000000
2025-12: -0.333333
```

---

## Adaptive Threshold Calculation

### For 2025-12 (wave 16):

**evaluation.gs:**
- Previous non-zero V_slope_6 values: [-1.0, -0.5, -0.583, -0.375, -0.333, 0.333, 0.4]
- p10 of previous slopes: **-0.750**
- threshold_neg = min(-0.750, -0.20) = **-0.750**
- Current V_slope_6: **-0.333**
- Condition: -0.333 <= -0.750? **FALSE**
- **Should NOT flag as weakness**

**we_analyzer.py:**
- Previous non-NaN V_slope_6 values: [0.0, 0.0, 0.0, 0.0, 0.0, -0.333, 0.0, 0.333, 0.4, 0.0]
- p10 of previous slopes: **-0.558**
- threshold_neg = min(-0.558, -0.20) = **-0.558**
- Current V_slope_6: **-0.333**
- Condition: -0.333 <= -0.558? **FALSE**
- **Should NOT flag as weakness**

---

## Conclusion

**Both systems should NOT flag V as mid_weakness** for hiroki_hosono@ulvac.com in wave 2025-12, because:

1. The current V_slope_6 (-0.333) is NOT below the adaptive threshold
2. The adaptive threshold is more negative than the current slope
3. This means -0.333 is within the person's normal range of variation

---

## Questions for User

1. **Which version of evaluation.gs is running?**
   - Is it the old version (before adaptive thresholds were added)?
   - Or the new version (with expandingQuantileExclusive)?

2. **Can you provide the actual evaluation.gs output data?**
   - What wave does the output show?
   - What are the V_slope_6, D_slope_6, A_slope_6 values?
   - What is the weakness_mid value?

3. **Is the evaluation.gs output from 2025-12?**
   - Or could it be from an earlier wave (like 2025-07) when V_slope_6 was -0.333?

---

## Possible Explanations

### Scenario A: Old evaluation.gs (Pre-Adaptive Thresholds)

If evaluation.gs is using the OLD logic with fixed thresholds:

```javascript
// Old logic
if (slopeValue <= -MIN_SLOPE_NEG) {  // if slope <= -0.20
  midWeaknessLists[i].push(dim.label);
}
```

Then:
- V_slope_6 = -0.333 <= -0.20? **TRUE**
- Would flag as weakness ✓

**This would explain the discrepancy!**

### Scenario B: Different Wave

If the evaluation.gs output is from wave 2025-07 (not 2025-12):
- V_slope_6 for 2025-07 was also -0.333
- But the adaptive threshold would be different based on history up to that point

### Scenario C: Bug in evaluation.gs Implementation

There might be a bug in how I implemented the adaptive threshold logic in evaluation.gs that differs from we_analyzer.py.

---

## Recommendation

**Before making any code changes**, please:

1. Verify which version of evaluation.gs is running
2. Run evaluation.gs on the current data and share the output
3. Confirm the wave and values in the output

This will help determine whether:
- evaluation.gs needs to be updated/redeployed
- There's a bug in the new implementation
- The discrepancy is from different data/waves

---

## Next Steps

**IF using old evaluation.gs:**
- Deploy the updated evaluation.gs with adaptive thresholds
- Results should then match we_analyzer.py

**IF using new evaluation.gs:**
- Debug why the adaptive logic isn't working as expected
- Compare actual calculations step-by-step

