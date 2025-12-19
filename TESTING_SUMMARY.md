# Testing Summary: Updated evaluate.gs Implementation

## What Was Done

I've successfully updated `Report/evaluate.gs` to match the logic in `Playbook/we_analyzer.py`. All changes have been implemented and the script is ready for testing.

## Files Created for Testing

### 1. **Admin/test_new_evaluate.gs** (New Test Script)
   - Contains test functions to validate the new logic
   - Tests individual users or groups
   - Writes results to sheets for easy review

### 2. **Admin/TESTING_GUIDE.md** (Complete Testing Guide)
   - Step-by-step testing instructions
   - Validation checklists
   - Common issues and solutions
   - How to interpret results

### 3. **Admin/MIGRATION_UPDATE.md** (Migration Instructions)
   - How to update migration.gs for the new field structure
   - Sheet header updates
   - Testing and validation procedures
   - Rollback plan if needed

## Quick Start: How to Test

### Step 1: Upload to Google Apps Script

1. Open your Google Sheet
2. Go to **Extensions > Apps Script**
3. Add the new test script:
   - Create a new file: `Admin/test_new_evaluate.gs`
   - Copy content from the file I created
4. Verify `Report/evaluate.gs` is updated (it should be on your local machine)

### Step 2: Run Your First Test

In the Apps Script Editor, run this function:

```javascript
testNewEvaluateLogic()
```

**What to expect:**
- Tests first 3 users in your dataset
- Shows results in console (View > Logs)
- Takes 10-30 seconds depending on data size

**Look for:**
- ✓ No errors
- ✓ New metrics appear (`E_delta_1_std_12`, `E_slope_6_std_12`)
- ✓ New trend categories ("急上昇", "連続上昇", etc.)
- ✓ All fields populated

### Step 3: Write Results to Sheet

```javascript
writeTestResultsToSheet()
```

This creates a new sheet with all test results in tabular format for easy review.

### Step 4: Test Specific Users

```javascript
testSpecificUser("user@example.com")
```

Use this to deep-dive into specific cases or troubleshoot issues.

## Key Changes to Verify

### New Metrics
- **E_delta_1_std_12**: Standardized 1-month change (should be numeric)
- **E_slope_6_std_12**: Standardized 6-month slope (should be numeric)

### Updated Categorizations
- **trend_base**: Now uses dual-condition logic (absolute + standardized)
- **trend_recent**: 7 categories instead of 3
  - New: "急上昇", "急落", "連続上昇", "連続下降"
- **trend_refined**: New 9-priority classification system
- **change_tag**: Based on 2σ threshold (more personalized)

### Removed Fields
These are no longer calculated:
- All quantile/Z-score fields (V/D/A_deltaP10/P90/Z, V/D/A_slopeP10/P90/Z)
- E_momentum_3, E_mean_6, E_slope_12, E_accel_6

## Expected Test Results

### Sample Output (Console)
```
=== Starting New Evaluate Logic Test ===
Using sheet: RatingSS
Total rows: 1250
Total unique users: 125

============================================================
User 1: user@example.com
============================================================
Total records: 12

--- Analysis Results (Latest) ---
Level: High
Trend Base: 上昇中
Trend Recent: 連続上昇          ← NEW CATEGORY
Trend Refined: 上昇加速
Change Tag: 変化大
Stability: 安定

Strength/Weakness:
  Short Strength: V, D
  Short Weakness:
  Mid Strength: V
  Mid Weakness:

New Metrics:
  E_delta_1_std_12: 1.85         ← NEW FIELD
  E_slope_6_std_12: 0.52         ← NEW FIELD

Key Metrics:
  E_delta_1: 5.5
  E_delta_1_prev: 3.2
  E_slope_6: 0.68
  V_delta_1: 2.0, D_delta_1: 2.5, A_delta_1: 1.0
  V_slope_6: 0.45, D_slope_6: 0.38, A_slope_6: 0.15

============================================================
=== Test Summary ===
============================================================
Tested users: 3

Trend Base Distribution:
  上昇中: 2
  安定: 1

Trend Recent Distribution:
  連続上昇: 1
  上昇: 1
  横ばい: 1

Trend Refined Distribution:
  上昇加速: 1
  上昇期待: 1
  安定維持: 1

=== Test Complete ===
```

## Common Scenarios to Test

### Scenario 1: User with Insufficient History (< 3 months)
**Expected:**
- trend_base: "未評価"
- trend_refined: "上昇", "下降", or "安定維持"
- strength_mid, weakness_mid: Empty
- Slope fields: NaN or empty

### Scenario 2: User with Steady Growth
**Expected:**
- trend_base: "上昇中"
- trend_recent: "連続上昇" (if 2+ months of growth)
- trend_refined: "上昇継続" or "上昇加速"
- E_slope_6_std_12: Positive value (> 0.45 typical)

### Scenario 3: User with Sudden Large Change
**Expected:**
- change_tag: "変化大"
- E_delta_1_std_12: > 2.0 or < -2.0
- trend_recent: "急上昇" or "急落"
- trend_refined: Acceleration or reversal pattern

### Scenario 4: User with Stable Engagement
**Expected:**
- trend_base: "安定"
- trend_recent: "横ばい"
- trend_refined: "安定維持"
- E_slope_6_std_12: Between -0.45 and 0.45

## Validation Checklist

### ✓ Before Migration
- [ ] All tests pass without errors
- [ ] New fields are populated correctly
- [ ] Trend categories show expected values
- [ ] Spot-check 5-10 users manually
- [ ] Compare with Python output (if available)

### ✓ After Migration
- [ ] Sheet headers updated (21 columns instead of 43)
- [ ] All rows processed successfully
- [ ] No #ERROR! values in sheet
- [ ] Random sampling shows correct values
- [ ] Backup created before migration

## Troubleshooting

### If tests fail:
1. **Check console logs** - Shows exact error and line number
2. **Test with specific user** - Use `testSpecificUser("email")`
3. **Verify sheet structure** - Check column names match exactly
4. **Check data quality** - Ensure engagement values are numeric
5. **Review TESTING_GUIDE.md** - Section on "Common Issues and Solutions"

### If results seem incorrect:
1. **Compare with old values** - Use `compareOldVsNew("email")`
2. **Check thresholds** - Verify constants match Python
3. **Test edge cases** - Users with 3, 6, 12 months of data
4. **Review calculation logic** - Compare step-by-step with Python

## Next Steps

1. **Run tests** following TESTING_GUIDE.md
2. **Validate results** using the checklist
3. **Update migration** following MIGRATION_UPDATE.md
4. **Deploy to production** after successful testing

## File Locations

```
WorkEngagementSystem/
├── Report/
│   └── evaluate.gs (UPDATED - main evaluation logic)
├── Admin/
│   ├── test_new_evaluate.gs (NEW - test script)
│   ├── TESTING_GUIDE.md (NEW - testing instructions)
│   ├── MIGRATION_UPDATE.md (NEW - migration guide)
│   └── migration.gs (needs update after testing)
└── TESTING_SUMMARY.md (this file)
```

## Support Resources

- **TESTING_GUIDE.md**: Comprehensive testing procedures
- **MIGRATION_UPDATE.md**: Migration and deployment steps
- **evaluate.gs comments**: Inline documentation of logic
- **Python reference**: `Playbook/we_analyzer.py` for comparison

## Questions?

If you encounter any issues during testing:
1. Review the error messages in console logs
2. Check the TESTING_GUIDE.md for solutions
3. Test with specific users to isolate problems
4. Compare calculations with Python implementation
5. Ask for help with specific error messages or unexpected results

---

**Status: Ready for Testing** ✓

All implementation complete. You can now begin testing using the scripts and guides provided.
