# Fix for Rating Sheet Race Condition

## Problem

The current code has a race condition bug where evaluation results might be written to the wrong row in the rating sheet. This happens because:

1. `recordEngagement()` writes raw data to a new row and RETURNS the row number
2. BUT this row number is IGNORED in `send_response.gs`
3. Later, `makeIndividualSheet()` calls `getLastRow()` again, which might return a different row if:
   - Another form submission happened concurrently
   - The sheet hasn't fully synchronized yet
   - There's a timing delay

## The Fix

We need to pass the row number from `recordEngagement()` to `makeIndividualSheet()` so the evaluation results are written to the SAME row as the raw data.

### Changes Required

#### 1. Update send_response.gs

**Current code (lines 26-34):**
```javascript
recordEngagement(address, responseDate, engagement, concern, comment);
Logger.log("Recorded engagement data of " + address);

// Specify the individual sheet of the member and set it the global variable.
const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;
IndividualSheet = RatingSS.getSheetByName(name);  // Set as a global variable.

const engagementStatus = makeIndividualSheet(address, name, responseDate, AnalysisPeriod);
```

**Fixed code:**
```javascript
const ratingRowNumber = recordEngagement(address, responseDate, engagement, concern, comment);
Logger.log("Recorded engagement data of " + address);

// Specify the individual sheet of the member and set it the global variable.
const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;
IndividualSheet = RatingSS.getSheetByName(name);  // Set as a global variable.

const engagementStatus = makeIndividualSheet(address, name, responseDate, AnalysisPeriod, ratingRowNumber);
```

#### 2. Update make_individual.gs

**Current function signature (line 29):**
```javascript
function makeIndividualSheet(address, name, responseDate, period) {
```

**Fixed function signature:**
```javascript
function makeIndividualSheet(address, name, responseDate, period, ratingRowNumber = null) {
```

**Current code (lines 66-71):**
```javascript
ensureResultHeaders(RatingSheet);
const lastRow = IndividualSheet.getLastRow();
IndividualSheet.getRange(lastRow, RESULT_START_COLUMN, 1, valuesRow.length).setValues([valuesRow]);

const lastRowOfRatingSheet = RatingSheet.getLastRow();
RatingSheet.getRange(lastRowOfRatingSheet, RESULT_START_COLUMN, 1, valuesRow.length).setValues([valuesRow]);
```

**Fixed code:**
```javascript
ensureResultHeaders(RatingSheet);
const lastRow = IndividualSheet.getLastRow();
IndividualSheet.getRange(lastRow, RESULT_START_COLUMN, 1, valuesRow.length).setValues([valuesRow]);

// Use the provided row number if available, otherwise fall back to getLastRow() for backward compatibility
const targetRowInRatingSheet = ratingRowNumber !== null ? ratingRowNumber : RatingSheet.getLastRow();
RatingSheet.getRange(targetRowInRatingSheet, RESULT_START_COLUMN, 1, valuesRow.length).setValues([valuesRow]);
```

## Benefits

1. **Eliminates race condition**: Results are guaranteed to be written to the same row as the raw data
2. **Backward compatible**: The `ratingRowNumber` parameter is optional with a default value
3. **No breaking changes**: Existing calls to `makeIndividualSheet()` will still work
4. **More reliable**: No longer depends on timing or sheet synchronization

## Testing

After applying the fix:

1. Test with a single form submission - verify results appear in correct row
2. Test with rapid form submissions (multiple users submitting quickly) - verify no mismatches
3. Run `verifyAllRatings()` to confirm existing data is still accessible

## Migration Path

1. Apply the code fixes above
2. Run `repairRatings(false)` to fix the existing 2 wrong records
3. Monitor new submissions to ensure no new discrepancies occur
4. After a few weeks of monitoring, the issue should be resolved

## Alternative: Full Recalculation Approach

If you prefer to completely rebuild the rating sheet from scratch (most conservative approach):

```javascript
function rebuildRatingSheet() {
  // This would:
  // 1. Read all individual sheets
  // 2. Recalculate all evaluation results
  // 3. Rebuild the rating sheet from scratch
  //
  // This is the "nuclear option" but guarantees everything is correct
}
```

Let me know if you'd like me to implement this alternative approach.
