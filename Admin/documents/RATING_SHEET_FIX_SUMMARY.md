# Rating Sheet Fix - Testing Summary

## Changes Made

### 1. Fixed Race Condition Bug

**Problem**: Evaluation results were sometimes written to the wrong row in the rating sheet due to a race condition when multiple form submissions occurred close together.

**Files Modified**:
- `Report/send_response.gs` - Now captures and passes the row number from `recordEngagement()`
- `Report/make_individual.gs` - Now accepts and uses the row number to write results to the correct row

**Changes**:
- In `send_response.gs:26`: Changed from `recordEngagement(...)` to `const ratingRowNumber = recordEngagement(...)`
- In `send_response.gs:34`: Added `ratingRowNumber` parameter to `makeIndividualSheet()` call
- In `make_individual.gs:29`: Added `ratingRowNumber = null` parameter (optional for backward compatibility)
- In `make_individual.gs:70-73`: Now uses `ratingRowNumber` when available instead of calling `getLastRow()` again

### 2. Created Verification & Repair Tools

**New File**: `Admin/verify_and_repair_ratings.gs`

This script provides functions to:
- `verifyAllRatings()` - Check all records for discrepancies (read-only, safe to run)
- `repairRatings(false)` - Fix any discrepancies found
- `verifyUserRatings(email)` - Check a specific user's records
- `quickVerify()` - Quick check showing only the count of problems

## Testing Instructions

### Step 1: Verify Current Issues

Run this in your Google Apps Script editor (Report project):

```javascript
verifyAllRatings()
```

This will:
- Check all ~40 records in the rating sheet
- Compare actual values with recalculated values
- Report exactly which 2 records are wrong and what's wrong with them
- **Will not modify anything** - safe to run

### Step 2: Review the Report

Look at the output to confirm it found the 2 wrong records you mentioned. The output will show:
- Row numbers of problematic records
- User emails and dates
- Which specific fields are wrong
- What the values should be

### Step 3: Repair the Wrong Records

Once you've confirmed the script found the correct issues, run:

```javascript
repairRatings(false)  // false = actually make changes
```

This will:
- Fix the 2 wrong records by recalculating their evaluation results
- Write the correct values to the rating sheet
- Keep a log of what was repaired

**Note**: Run `repairRatings(true)` first if you want a dry run (no changes).

### Step 4: Verify the Fix Worked

Run again:

```javascript
verifyAllRatings()
```

You should now see: "✓ No discrepancies found! All records are correct."

### Step 5: Test New Submissions

Submit a few test form responses and check that:
1. The log shows correct evaluation results
2. The rating sheet has matching values in the correct rows
3. The individual sheets also have matching values

You can use `verifyUserRatings("test@example.com")` to check specific test submissions.

### Step 6: Monitor

Over the next few days/weeks, periodically run `quickVerify()` to ensure no new discrepancies appear.

## Expected Results

### Before the Fix
- 2 out of ~40 records have mismatches
- Individual sheets correct, rating sheet wrong for those 2
- Race condition could cause more mismatches with concurrent submissions

### After the Fix
- All 40 records correct after running `repairRatings(false)`
- New submissions will have results written to the correct row
- No more race condition issues, even with concurrent submissions

## Rollback Plan

If anything goes wrong:

1. The verification scripts are read-only by default - they won't modify data unless you explicitly run `repairRatings(false)`

2. You can revert the code changes:
   - Use Git to revert to commit before these changes
   - Or manually remove the `ratingRowNumber` parameter from the function calls

3. The old code will still work (just with the race condition bug still present)

## Additional Tools

### Check a Specific User
```javascript
verifyUserRatings("user@example.com")
```

### Quick Count of Issues
```javascript
const issueCount = quickVerify()
```

### Compare Log vs Sheet for User
Use the diagnostic script from `Admin/diagnose_header_mismatch.gs`:
```javascript
compareLogVsSheet("user@example.com")
```

## Questions or Issues?

If you encounter any problems:

1. Check the GAS execution log for error messages
2. Make sure `setGlobals()` is called before the verification scripts run
3. Verify that `ENGAGEMENT_RESULT_FIELDS` is defined in `evaluate.gs`
4. Check that the RatingSheet has the correct headers starting from column J

## Next Steps

After testing and confirming everything works:

1. ✅ Run `verifyAllRatings()` to find the 2 wrong records
2. ✅ Run `repairRatings(false)` to fix them
3. ✅ Test with new form submissions
4. ✅ Monitor with `quickVerify()` periodically
5. ✅ Consider the fix successful when no new issues appear after ~1 week

## Technical Details

### Root Cause

The race condition occurred in this sequence:

1. `recordEngagement()` writes raw data to row N and returns N
2. BUT the return value was ignored
3. `makeIndividualSheet()` called `getLastRow()` again
4. If the sheet hadn't synchronized yet, or if another submission occurred between steps 1 and 3, `getLastRow()` could return a different row number
5. Evaluation results were written to the wrong row

### The Fix

Now the code:
1. Captures the row number from `recordEngagement()`
2. Passes it to `makeIndividualSheet()`
3. Uses that exact row number instead of calling `getLastRow()` again
4. This guarantees results go to the same row as the raw data

### Backward Compatibility

The `ratingRowNumber` parameter is optional (defaults to `null`), so:
- Old code that doesn't pass it will still work
- It will fall back to `getLastRow()` (the old behavior)
- No breaking changes for other parts of the system
