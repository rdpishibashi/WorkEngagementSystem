# Testing Guide for Updated evaluate.gs

This guide will help you test the updated `evaluate.gs` logic against your actual data.

## Overview

The updated `evaluate.gs` implements new logic that matches `we_analyzer.py`. Key changes include:

### New Metrics
- `E_delta_1_std_12` - Standardized 1-month change (delta / 12-month std)
- `E_slope_6_std_12` - Standardized 6-month slope (slope / 12-month std)

### Updated Logic
- **trend_base**: Dual-condition detection (absolute + standardized slopes)
- **trend_recent**: 7 categories instead of 3 (急上昇, 上昇, 横ばい, 下降, 急落, 連続上昇, 連続下降)
- **trend_refined**: New priority system with 9 levels
- **change_tag**: Standardized approach (2σ threshold instead of absolute)

---

## Prerequisites

1. **Google Apps Script Project** with:
   - Updated `Report/evaluate.gs` (the file we just modified)
   - Test data sheet (e.g., "RatingSS") with columns:
     - year, month, mail address
     - engagement, vigor, dedication, absorption

2. **Test Script** (`Admin/test_new_evaluate.gs`) uploaded to your project

---

## Testing Steps

### Step 1: Upload Files to Google Apps Script

1. Open your Google Sheets file
2. Go to **Extensions > Apps Script**
3. Upload or copy the following files to your script project:
   - `Report/evaluate.gs` (updated version)
   - `Admin/test_new_evaluate.gs` (new test script)

4. Verify the files are in your project:
   ```
   Your Project/
   ├── Report/
   │   └── evaluate.gs (updated)
   └── Admin/
       ├── test_new_evaluate.gs (new)
       ├── migration.gs
       └── utilities.gs
   ```

---

### Step 2: Run Basic Tests

#### Test 2.1: Run Basic Test on 3 Users

```javascript
// In Apps Script Editor, run this function
testNewEvaluateLogic()
```

**What it does:**
- Tests the first 3 users in your dataset
- Displays results in the console (View > Logs)
- Shows trend distributions

**What to check:**
1. No errors in execution
2. Console shows analysis results for each user
3. New fields appear (`E_delta_1_std_12`, `E_slope_6_std_12`)
4. Trend categories show new values (e.g., "急上昇", "連続上昇")

**Expected Output:**
```
=== Starting New Evaluate Logic Test ===
Using sheet: RatingSS
Total rows: 1250
...
User 1: user@example.com
Total records: 12
--- Analysis Results (Latest) ---
Level: High
Trend Base: 上昇中
Trend Recent: 連続上昇
Trend Refined: 上昇加速
Change Tag: 変化大
...
New Metrics:
  E_delta_1_std_12: 1.85
  E_slope_6_std_12: 0.52
```

---

#### Test 2.2: Test Specific User

```javascript
// Test a specific user by email
testSpecificUser("user@example.com")
```

**What it does:**
- Shows complete history for one user
- Displays detailed analysis results
- Useful for deep-dive debugging

**What to check:**
1. All historical records are shown
2. Latest analysis matches expectations
3. Metrics make sense given the history

---

#### Test 2.3: Compare Old vs New

```javascript
// Compare old vs new logic
compareOldVsNew("user@example.com")
```

**What it does:**
- Runs new logic
- Shows which values changed
- You manually compare with existing sheet values

**What to check:**
1. **Unchanged fields** (should match old values):
   - `level`
   - `stability`
   - `E_delta_1`, `V_delta_1`, `D_delta_1`, `A_delta_1`
   - `E_slope_6`, `V_slope_6`, `D_slope_6`, `A_slope_6`

2. **Changed fields** (may differ):
   - `trend_base` (now uses dual-condition)
   - `trend_recent` (now has 7 categories)
   - `trend_refined` (new priority logic)
   - `change_tag` (now standardized)
   - `strength_short`, `weakness_short` (simplified logic)
   - `strength_mid`, `weakness_mid` (simplified logic)

3. **New fields**:
   - `E_delta_1_std_12` (should be a number)
   - `E_slope_6_std_12` (should be a number)

---

### Step 3: Write Results to Sheet

```javascript
// Write test results to a new sheet for easy review
writeTestResultsToSheet()
```

**What it does:**
- Runs tests on first 3 users
- Creates a new sheet: "Test_Results_YYYY-MM-DD"
- Writes all results in tabular format

**What to check:**
1. New sheet is created
2. All columns are populated
3. No "#ERROR!" values
4. Numbers are formatted correctly (2 decimal places)

---

### Step 4: Full Data Validation

Once basic tests pass, test with ALL users:

#### Modify test script:
In `test_new_evaluate.gs`, change line:
```javascript
const testUserCount = Math.min(3, addresses.length);
```
to:
```javascript
const testUserCount = addresses.length;  // Test ALL users
```

Then run `writeTestResultsToSheet()` again.

---

## Validation Checklist

### ✅ Basic Validation

- [ ] No execution errors
- [ ] All users processed successfully
- [ ] Console logs show expected output
- [ ] Test results sheet created

### ✅ Data Quality Checks

- [ ] **Level values** are valid: "Thriving", "High", "Moderate", "Low", "Critical"
- [ ] **trend_base** values are: "上昇中", "低下中", "安定", "未評価"
- [ ] **trend_recent** values include new categories: "急上昇", "連続上昇", etc.
- [ ] **trend_refined** shows variety (not all "安定維持")
- [ ] **Numeric fields** have reasonable values (not all 0 or NaN)
- [ ] **New fields** (`E_delta_1_std_12`, `E_slope_6_std_12`) are populated

### ✅ Logic Validation

#### Users with < 3 months history:
- [ ] `trend_base` = "未評価"
- [ ] `trend_refined` = "上昇", "下降", or "安定維持"
- [ ] `strength_mid`, `weakness_mid` are empty
- [ ] Slope fields are empty or NaN

#### Users with rising engagement:
- [ ] `trend_base` = "上昇中" (if slope > 0.5 or slope_std > 0.45)
- [ ] `trend_recent` includes "上昇", "急上昇", or "連続上昇"
- [ ] `trend_refined` includes acceleration/continuation patterns

#### Users with falling engagement:
- [ ] `trend_base` = "低下中" (if slope < -0.5 or slope_std < -0.45)
- [ ] `trend_recent` includes "下降", "急落", or "連続下降"
- [ ] `trend_refined` includes decline/crisis patterns

#### Users with large recent changes:
- [ ] `change_tag` = "変化大" when `|E_delta_1| / E_std_12 > 2.0`
- [ ] `trend_refined` reflects acceleration or reversal patterns

---

## Common Issues and Solutions

### Issue 1: "Column not found" error

**Cause:** Your sheet column names don't match expected names.

**Solution:** Check that your sheet has these exact column names (case-insensitive):
- "year"
- "month"
- "mail address"
- "engagement"
- "vigor"
- "dedication"
- "absorption"

---

### Issue 2: All values are 0 or empty

**Cause:** Insufficient data or hasMidHistory = false

**Solution:**
- Check that users have at least 3 months of data
- Verify `MID_MIN_RECORDS = 2` in evaluate.gs constants

---

### Issue 3: trend_recent always "横ばい"

**Cause:** Delta values too small

**Solution:**
- Check `TREND_RECENT_DELTA = 2.0` threshold
- Verify engagement values have sufficient variation
- Check if delta calculations are correct (E_delta_1)

---

### Issue 4: New fields (E_delta_1_std_12, E_slope_6_std_12) are NaN

**Cause:** E_std_12 is 0 or NaN

**Solution:**
- Verify users have at least 12 months of data for std_12
- Check if engagement values vary (std > 0)
- For users with < 12 months, these fields will be NaN (expected)

---

## Interpreting Results

### Understanding New Metrics

**E_delta_1_std_12:**
- Measures how unusual the recent change is relative to personal history
- Value > 2.0 → "変化大" (big change, 2 sigma event)
- Value < -2.0 → "変化大" (big decline, 2 sigma event)
- -2.0 to 2.0 → Normal variation

**E_slope_6_std_12:**
- Standardized 6-month slope
- Used for trend_base detection
- Value > 0.45 → "上昇中"
- Value < -0.45 → "低下中"
- -0.45 to 0.45 → "安定"

### Understanding New Trend Categories

**trend_recent (7 categories):**
- **急上昇**: Delta ≥ 6.0 (acute rise)
- **連続上昇**: Delta > 2.0 for 2 consecutive periods
- **上昇**: 2.0 < Delta < 6.0
- **横ばい**: -2.0 ≤ Delta ≤ 2.0
- **下降**: -6.0 < Delta < -2.0
- **連続下降**: Delta < -2.0 for 2 consecutive periods
- **急落**: Delta ≤ -6.0 (acute fall)

**trend_refined (9 priority levels):**
1. 未評価 (insufficient history)
2. 上昇加速 / 低下加速 (acceleration)
3. 上昇継続 / 低下継続 (continuation)
4. 復活 / 悪化 (reversal with big change)
5. 回復 / 低下危機 (reversal without big change)
6. 上昇期待 / 低下警戒 (from stable)
7. 低下懸念 / 回復期待 (to flat)
8. 安定維持 (stable)
9. Default fallback

---

## Next Steps After Testing

1. **If tests pass:**
   - Update migration.gs to use new evaluate.gs
   - Update column mappings in updateRowWithAnalysisResults
   - Run migration on full dataset

2. **If tests fail:**
   - Review error logs
   - Check specific user data
   - Verify constant values match Python
   - Compare calculation logic step-by-step

3. **For production deployment:**
   - Backup existing data
   - Run migration on subset first
   - Validate results before full migration
   - Update documentation with new field definitions

---

## Support

If you encounter issues:
1. Check console logs for detailed error messages
2. Test with specific users using `testSpecificUser()`
3. Verify input data quality
4. Compare with Python implementation for reference
5. Review the implementation plan document

---

## Appendix: Field Mapping Reference

### Fields Removed (no longer in output):
- `V_deltaP10`, `D_deltaP10`, `A_deltaP10`
- `V_deltaP90`, `D_deltaP90`, `A_deltaP90`
- `V_deltaZ`, `D_deltaZ`, `A_deltaZ`
- `V_slopeP10`, `D_slopeP10`, `A_slopeP10`
- `V_slopeP90`, `D_slopeP90`, `A_slopeP90`
- `V_slopeZ`, `D_slopeZ`, `A_slopeZ`
- `E_momentum_3`, `E_mean_6`, `E_slope_12`, `E_accel_6`

### Fields Added (new in output):
- `E_delta_1_std_12` (standardized 1-month change)
- `E_slope_6_std_12` (standardized 6-month slope)

### Fields Unchanged (same calculation):
- `level`
- `stability`
- `E_delta_1`, `E_delta_1_prev`
- `E_slope_6`
- `V_delta_1`, `D_delta_1`, `A_delta_1`
- `V_slope_6`, `D_slope_6`, `A_slope_6`

### Fields with Modified Logic:
- `trend_base` (new dual-condition logic)
- `trend_recent` (7 categories instead of 3)
- `trend_refined` (new 9-priority system)
- `change_tag` (standardized vs absolute threshold)
- `strength_short`, `weakness_short` (simplified)
- `strength_mid`, `weakness_mid` (simplified)
