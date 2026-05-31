# Bug Fix #3: mid_weakness Discrepancy - ROOT CAUSE IDENTIFIED

**Date:** 2026-01-03
**Issue:** we_analyzer.py outputs empty mid_weakness, but evaluation.gs outputs "V"
**Person:** hiroki_hosono@ulvac.com
**Status:** ✓ ROOT CAUSE IDENTIFIED - NOT A BUG, DATA DIFFERENCE

---

## Root Cause Summary

**This is NOT a bug in the code.** The discrepancy is caused by **different data sources with different history lengths**:

1. **we_analyzer.py** reads from `EngagementMasterSS.xlsx` with **16 waves** (2024-08 to 2025-12)
2. **evaluation.gs** reads from `RatingSS` Google Sheet with **12 waves** (2025-01 to 2025-12)

By design, RatingSS only stores the **last 10-12 waves** for each person, while EngagementMasterSS contains full history.

---

## Data Comparison

### EngagementMasterSS.xlsx (16 waves)

```
Wave      Vigor  V_slope_6
2024-08      9   0.00
2024-09      8  -1.00
2024-10      8  -0.50
2024-12      7  -0.67
2025-01      8  -0.25
2025-02      8   0.00
2025-03      9   0.00
2025-04      8   0.00
2025-05      7   0.00
2025-06      8   0.00
2025-07      7  -0.33
2025-08     10   0.00
2025-09      9   0.33
2025-10      9   0.40
2025-11      7   0.00
2025-12      8  -0.33
```

### RatingSS (12 waves - last 10-12 waves only)

```
Wave      Vigor  V_slope_6 (calculated by evaluation.gs)
2025-01      8   0.00
2025-02      8   0.00
2025-03      9   0.50
2025-04      8   0.00
2025-05      7  -0.125
2025-06      8   0.00
2025-07      7  -0.33
2025-08     10   0.00
2025-09      9   0.33
2025-10      9   0.40
2025-11      7   0.00
2025-12      8  -0.33
```

**Note:** The vigor ratings match for overlapping waves, but slopes differ due to:
1. Different calculation methods (we_analyzer.py requires 6 values, evaluation.gs works with 2+)
2. Different historical context (16 vs 12 waves)

---

## Impact on Adaptive Thresholds

### For wave 2025-12, Vigor dimension:

**we_analyzer.py (16 waves):**
- Previous V_slope_6 values: 15 values from history
- 10th percentile (p10): **-0.558**
- Threshold: min(-0.558, -0.20) = **-0.558**
- Current V_slope_6: **-0.333**
- **-0.333 > -0.558** → NO FLAG ✓

**evaluation.gs (12 waves):**
- Previous V_slope_6 values: 11 values from history
- 10th percentile (p10): **-0.125**
- Threshold: min(-0.125, -0.20) = **-0.20** (falls back to minimum)
- Current V_slope_6: **-0.333**
- **-0.333 <= -0.20** → FLAG as weakness ✓

---

## Why This Happens

With **fewer waves** in the history:
1. The adaptive threshold has **less context**
2. The p10 (10th percentile) is **higher** (less negative)
3. Falls back to the **minimum threshold** (-0.20)
4. More sensitive to recent changes

With **more waves** in the history:
1. The adaptive threshold has **more context**
2. The p10 includes older, more negative values
3. Threshold is **lower** (more negative)
4. Less sensitive to recent changes (requires bigger deviation)

---

## Both Systems Are Working Correctly

✓ **we_analyzer.py** is correct based on full 16-wave history
✓ **evaluation.gs** is correct based on limited 12-wave history
✓ **Adaptive threshold logic** is working as designed in both

The difference is **intentional** based on the different data sources.

---

## Decision Required

**Question:** Should both systems use the same data source and produce identical results?

### Option A: Keep Current Behavior (Different Data Sources)
- **Pros:**
  - RatingSS is optimized for recent performance (last 10-12 waves)
  - Faster evaluation, less data to process
  - May be more responsive to recent trends
- **Cons:**
  - Results differ between we_analyzer.py and evaluation.gs
  - Confusing for users when comparing outputs
  - Two sources of truth

### Option B: Align Data Sources (Both Use Full History)
- **Pros:**
  - Consistent results across both systems
  - Single source of truth
  - Better for long-term trend analysis
- **Cons:**
  - Need to update RatingSS to store full history
  - More data to process in evaluation.gs
  - May lose "focus on recent performance" aspect

### Option C: Align Data Sources (Both Use Last 10-12 Waves)
- **Pros:**
  - Consistent results across both systems
  - Focus on recent performance
  - Less data to process
- **Cons:**
  - Lose long-term historical context
  - May miss important patterns from earlier periods

---

## Recommendation

**Recommended:** **Option B - Both use full history**

**Reasons:**
1. **Consistency:** Users expect the same results from both systems
2. **Accuracy:** More historical context = better adaptive thresholds
3. **Alignment:** we_analyzer.py and evaluation.gs should agree

**Implementation:**
1. Update RatingSS to store full history instead of just last 10-12 waves
2. OR: Have evaluation.gs read from EngagementMasterSS instead of RatingSS
3. Verify results match between both systems

---

## Alternative: Document the Difference

If different data sources are intentional:
1. **Document clearly** that evaluation.gs uses recent history (10-12 waves)
2. **Document clearly** that we_analyzer.py uses full history
3. **Explain** that this may lead to different results
4. **Add a note** in the output indicating which data source was used

---

## Summary

✓ **No bug in the code** - both systems work correctly
✓ **Root cause:** Different data sources (16 waves vs 12 waves)
✓ **Impact:** Different adaptive thresholds → different results
✓ **Decision needed:** Should both systems use the same data source?

