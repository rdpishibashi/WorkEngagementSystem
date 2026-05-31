# AnalysisPeriod Change Plan: 12 → 16

**Date:** 2026-01-03
**Goal:** Align evaluation.gs with we_analyzer.py by increasing historical data from 12 to 16 months
**Status:** READY FOR IMPLEMENTATION

---

## Current Situation

### Data Sources

| System | Data Source | Current Waves | After Change |
|--------|-------------|---------------|--------------|
| **we_analyzer.py** | EngagementMasterSS.xlsx | 16 (full history) | 16 (no change) |
| **evaluation.gs** | RatingSS (individual sheets) | 12 (last 12 months) | 16 (last 16 months) |

### Current Impact

With only 12 months of data, evaluation.gs calculates different adaptive thresholds than we_analyzer.py, leading to inconsistent results.

**Example:** hiroki_hosono@ulvac.com
- **12 months:** p10 = -0.125, threshold = -0.20 → flags V as weakness
- **16 months:** p10 = -0.558, threshold = -0.558 → does NOT flag

---

## Changes Required

### 1. Update Global Constant

**File:** `Admin/Globals.gs`
**Line:** 153

**Current:**
```javascript
const AnalysisPeriod = 12;        // Period for analysis/quantile calculations/individual sheets (12 months)
```

**New:**
```javascript
const AnalysisPeriod = 16;        // Period for analysis/quantile calculations/individual sheets (16 months)
```

**File:** `Report/set_globals.gs`
**Line:** 89

**Current:**
```javascript
AnalysisPeriod = 12;        // Period for analysis/quantile calculations/individual sheets (12 months)
```

**New:**
```javascript
AnalysisPeriod = 16;        // Period for analysis/quantile calculations/individual sheets (16 months)
```

### 2. Update Comments (Optional)

Update comments in the following files to reflect the new period:
- `Report/send_response.gs:67` - "Individual sheet contains AnalysisPeriod (16 months)..."
- Any other documentation referencing the 12-month period

---

## How It Works

### makeIndividualSheet Function Flow

```javascript
// Report/make_individual.gs:39-43
let startDate = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -period + 1);
startDate = DateUtil.getMonthFirstDate(startDate);
const individualData = userRatings.filter(rating =>
  rating[DateLabel] instanceof Date && setResponseDate(rating[DateLabel]) >= startDate
);
```

**Calculation:**
- Current: `responseDate - (12 - 1) = 12 months` including current
- New: `responseDate - (16 - 1) = 16 months` including current

**Example for 2025-12:**
- Current: 2025-12 - 11 months = **2025-01** to 2025-12 (12 months)
- New: 2025-12 - 15 months = **2024-09** to 2025-12 (16 months)

---

## Impact Analysis

### Data Availability (Current State)

Based on EngagementMasterSS.xlsx:

| Wave Count | Number of People | Percentage |
|------------|------------------|------------|
| >= 16 waves | 58 | 56% |
| >= 12 waves | 66 | 64% |
| < 12 waves | 37 | 36% |

### After Change

| Scenario | Number of People | Impact |
|----------|------------------|--------|
| **Will get full 16 months** | 58 | Full alignment with we_analyzer.py |
| **Will get 12-15 months** | 8 | More data than before, partial alignment |
| **Will get <12 months** | 37 | No change (get whatever is available) |

**Key Points:**
- 56% of people will have perfect alignment
- 8% will have better (but not perfect) alignment
- 36% are unchanged (already limited by available data)
- The code **gracefully handles** variable wave counts

---

## Verification

### What WON'T Change

These metric calculations use **fixed windows** independent of AnalysisPeriod:

✓ `E_std_12` - 12-month standard deviation (stays at 12)
✓ `E_slope_6` - 6-month slope (stays at 6)
✓ `E_slope_12` - 12-month slope (stays at 12)
✓ `MID_WINDOW` - 6-month window (stays at 6)

### What WILL Change

✓ Amount of historical data loaded into individual sheets: 12 → 16 months
✓ Number of waves available for adaptive threshold calculations
✓ p10/p90 quantile values (calculated from longer history)
✓ Robust Z-scores (calculated from longer history)
✓ Consistency between evaluation.gs and we_analyzer.py results

---

## Testing Plan

### Phase 1: Pre-Deployment Testing

1. **Update constants in test environment**
2. **Test with hiroki_hosono@ulvac.com:**
   - Run makeIndividualSheet()
   - Verify individual sheet has 16 rows (2024-09 to 2025-12)
   - Run evaluation
   - Verify weakness_mid is empty (not "V")
3. **Test with people who have <12 waves:**
   - Verify no errors occur
   - Verify they get whatever data is available

### Phase 2: Validation

1. **Compare results with we_analyzer.py for 5-10 people**
   - People with >= 16 waves
   - Check if mid_strength/mid_weakness match
   - Check if trend_base matches

2. **Verify no performance issues**
   - Check if individual sheet creation is still fast
   - Monitor memory usage

### Phase 3: Production Deployment

1. **Update both Globals.gs files**
2. **Run batch update to regenerate all individual sheets**
3. **Spot check 10-20 people for consistency**

---

## Rollback Plan

If issues occur:

1. **Revert constants back to 12**
2. **Re-run batch update to regenerate individual sheets**
3. **Results will return to previous state**

The change is **fully reversible** with no data loss.

---

## Potential Issues and Mitigations

### Issue 1: Sheet Size Limits

**Risk:** Individual sheets might hit Google Sheets row limits
**Mitigation:**
- Max 16 rows + 1 header = 17 rows total
- Well within Google Sheets limits (10 million cells per sheet)
- **Risk Level: NEGLIGIBLE**

### Issue 2: Performance

**Risk:** Loading more data might slow down evaluation
**Mitigation:**
- Only 4 additional months (33% increase)
- Filter operation is still O(n) where n is total person history
- **Risk Level: LOW**

### Issue 3: Inconsistent Data Between Sources

**Risk:** EngagementMasterSS and RatingSS might have different data
**Mitigation:**
- RatingSS is populated from MasterSS
- Data should be consistent for overlapping periods
- If discrepancies exist, they're already present (just not visible with 12-month window)
- **Risk Level: LOW** (not introduced by this change)

### Issue 4: People with Gaps in Data

**Risk:** Some people might have missing months within the 16-month period
**Mitigation:**
- Code already handles this with date filtering
- Adaptive logic works with whatever data is available
- **Risk Level: NEGLIGIBLE**

---

## Expected Outcomes

### For hiroki_hosono@ulvac.com

**Before (12 months):**
```
Individual sheet: 2025-01 to 2025-12 (12 waves)
V_slope_6 series: [0, 0, 0.5, 0, -0.125, 0, -0.333, 0, 0.333, 0.4, 0, -0.333]
p10: -0.125
threshold: -0.20
V_slope_6 (2025-12): -0.333
Result: -0.333 <= -0.20 → weakness_mid = "V" ❌
```

**After (16 months):**
```
Individual sheet: 2024-09 to 2025-12 (16 waves)
V_slope_6 series: [≈similar to we_analyzer.py]
p10: ≈-0.55 (based on we_analyzer.py calculation)
threshold: -0.55
V_slope_6 (2025-12): -0.333
Result: -0.333 > -0.55 → weakness_mid = "" ✓
```

### Overall

✓ **58 people** (56%) will have perfectly aligned results with we_analyzer.py
✓ **8 people** will have better alignment (more data than before)
✓ **Consistency** between Google Sheets evaluation and Python analysis
✓ **Better adaptive thresholds** with more historical context

---

## Implementation Steps

1. **Backup current Globals.gs files** ✓
2. **Update `Admin/Globals.gs` line 153:** `AnalysisPeriod = 16;` ✓
3. **Update `Report/set_globals.gs` line 89:** `AnalysisPeriod = 16;` ✓
4. **Test with hiroki_hosono@ulvac.com** (verify individual sheet has 16 rows)
5. **Run evaluation and verify weakness_mid is empty**
6. **If test passes:** Run batch regeneration of all individual sheets
7. **Spot check 10-20 people** for consistency with we_analyzer.py
8. **Monitor for any issues** in first week

---

## Deployment Checklist

- [ ] Backup Globals.gs files
- [ ] Update Admin/Globals.gs AnalysisPeriod to 16
- [ ] Update Report/set_globals.gs AnalysisPeriod to 16
- [ ] Update comments referencing "12 months" (optional)
- [ ] Test individual sheet creation for hiroki_hosono
- [ ] Verify individual sheet has 16 rows
- [ ] Run evaluation.gs for hiroki_hosono
- [ ] Verify weakness_mid matches we_analyzer.py (should be empty)
- [ ] Run batch regeneration of all individual sheets
- [ ] Spot check results for 10 people with >= 16 waves
- [ ] Document any unexpected issues
- [ ] Monitor performance for first week

---

## Success Criteria

✓ Individual sheets contain 16 months of data (when available)
✓ evaluation.gs results match we_analyzer.py for people with >= 16 waves
✓ No errors or performance degradation
✓ hiroki_hosono@ulvac.com shows weakness_mid = "" (not "V")

---

## Conclusion

**RECOMMENDATION: PROCEED WITH CHANGE**

- Simple, low-risk change (single constant update)
- Fully reversible
- High benefit (consistency between systems)
- Minimal downsides
- Well-tested logic (code already handles variable wave counts)

**Next Step:** Update the two Globals.gs files and test with hiroki_hosono.

