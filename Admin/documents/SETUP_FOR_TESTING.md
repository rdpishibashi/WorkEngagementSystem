# Setup Guide for Testing with Your Google Sheet

This guide shows you how to set up and run the test suite with your specific configuration.

## Your Configuration

You're using:
- **Excel file**: "Engagement Rating for Test.xlsx"
- **Google Sheet** accessed via: `SPREADSHEET_IDS.RATING`
- **Sheet name**: "rating"
- **Global variables**: `RatingSS` and `RatingSheet`

---

## Step 1: Upload Excel to Google Sheets

1. Go to Google Drive
2. Upload "Engagement Rating for Test.xlsx"
3. Open the uploaded file
4. It will automatically convert to Google Sheets format
5. **Copy the Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID_HERE/edit
                                          ^^^^^^^^^^^^^^^^^^^^
   ```

---

## Step 2: Update Globals.gs

Add or update the `SPREADSHEET_IDS` object in your `Globals.gs`:

```javascript
// In Admin/Globals.gs

const SPREADSHEET_IDS = {
  RATING: "YOUR_SPREADSHEET_ID_HERE"  // Paste the ID you copied
  // ... other spreadsheet IDs
};

// Initialize global sheet references
const RatingSS = SpreadsheetApp.openById(SPREADSHEET_IDS.RATING);
const RatingSheet = RatingSS.getSheetByName("rating");
```

**Important**: Make sure the sheet name is exactly "rating" (lowercase).

---

## Step 3: Verify Sheet Structure

Your "rating" sheet should have these columns (case-insensitive):

| Required Column | Description |
|----------------|-------------|
| year | Year (e.g., 2024) |
| month | Month (1-12) |
| mail address | User email |
| engagement | Engagement score |
| vigor | Vigor score |
| dedication | Dedication score |
| absorption | Absorption score |

**Optional columns**: section, group, name, date, day (can exist but not required for testing)

---

## Step 4: Upload Test Script

1. Open your Google Sheet
2. Go to **Extensions > Apps Script**
3. Create a new file: `Admin/test_new_evaluate.gs`
4. Copy the entire content from the test file I created
5. Save the project (Ctrl+S or Cmd+S)

---

## Step 5: Ensure evaluate.gs is Loaded

Make sure the updated `Report/evaluate.gs` is in your Apps Script project:

1. Check that `evaluate.gs` exists in your project
2. It should contain the new functions:
   - `calculateChangeTag()`
   - Updated `refineTrend()` with new priority logic
   - New metric calculations (`E_delta_1_std_12`, `E_slope_6_std_12`)

---

## Step 6: Run Your First Test

### Test 1: Verify Setup

In Apps Script Editor:
1. Select function: `verifyTestGlobals`
2. Click **Run** (▶)
3. Check the console (**View > Logs** or Ctrl+Enter)

**Expected output:**
```
✓ Global sheet references are properly initialized
  Sheet name: rating
  Rows: 150
  Columns: 12
```

**If you see errors:**
- Check that SPREADSHEET_IDS.RATING is correct
- Verify RatingSS and RatingSheet are defined
- Ensure sheet name is exactly "rating"

---

### Test 2: Run Main Test

1. Select function: `testNewEvaluateLogic`
2. Click **Run** (▶)
3. Review console output

**Expected output:**
```
=== Starting New Evaluate Logic Test ===

✓ Global sheet references are properly initialized
  Sheet name: rating
  Rows: 150
  Columns: 12

Total rows: 149
Total unique users: 50

Testing with 3 users...

============================================================
User 1: user1@example.com
============================================================
Total records: 8

--- Analysis Results (Latest) ---
Level: High
Trend Base: 上昇中
Trend Recent: 連続上昇
Trend Refined: 上昇加速
...
```

---

## Step 7: Test Specific Users

To test a specific user:

```javascript
testSpecificUser("user@example.com")
```

This shows:
- Complete history for that user
- All calculated metrics
- Detailed analysis results

---

## Step 8: Write Results to Sheet

To create a test results sheet:

```javascript
writeTestResultsToSheet()
```

This creates a new sheet: `Test_Results_YYYY-MM-DD` with all test results.

---

## Complete Setup Checklist

- [ ] Excel file uploaded to Google Drive
- [ ] Spreadsheet ID copied
- [ ] `SPREADSHEET_IDS.RATING` defined in Globals.gs
- [ ] `RatingSS` and `RatingSheet` globals defined
- [ ] Sheet named exactly "rating" with correct columns
- [ ] `test_new_evaluate.gs` uploaded to Apps Script
- [ ] Updated `evaluate.gs` is in the project
- [ ] `verifyTestGlobals()` runs successfully
- [ ] `testNewEvaluateLogic()` runs without errors

---

## Quick Reference: Available Test Functions

| Function | Purpose | When to Use |
|----------|---------|-------------|
| `verifyTestGlobals()` | Check setup is correct | First run, troubleshooting |
| `testNewEvaluateLogic()` | Test first 3 users | Initial testing |
| `testSpecificUser(email)` | Test one user in detail | Debug specific cases |
| `compareOldVsNew(email)` | Compare with old logic | Validation |
| `writeTestResultsToSheet()` | Export results to sheet | Create test report |

---

## Example: Complete Testing Workflow

```javascript
// 1. Verify setup
verifyTestGlobals()
// ✓ Global sheet references are properly initialized

// 2. Run basic test
testNewEvaluateLogic()
// Tests first 3 users, shows results in console

// 3. Test specific user if needed
testSpecificUser("user@example.com")
// Shows complete history and analysis

// 4. Create test report
writeTestResultsToSheet()
// Creates "Test_Results_2024-12-17" sheet
```

---

## Troubleshooting

### Error: "RatingSS is not defined"

**Solution:**
```javascript
// Add to Globals.gs:
const RatingSS = SpreadsheetApp.openById(SPREADSHEET_IDS.RATING);
const RatingSheet = RatingSS.getSheetByName("rating");
```

### Error: "Sheet 'rating' not found"

**Solution:**
- Check sheet name is exactly "rating" (lowercase)
- Verify you're opening the correct spreadsheet
- Check the spreadsheet ID in SPREADSHEET_IDS.RATING

### Error: "Column 'mail address' not found"

**Solution:**
- Verify column header is exactly "mail address" (lowercase)
- Check column name spelling in your sheet
- Column names are case-insensitive but must match exactly

### No results or all empty

**Solution:**
- Ensure users have at least 1 month of data
- Check that engagement/vigor/dedication/absorption have numeric values
- Verify data is not filtered or hidden in the sheet

---

## Next Steps After Successful Testing

Once all tests pass:
1. Follow **MIGRATION_UPDATE.md** to update migration.gs
2. Update sheet headers if running full migration
3. Backup existing data before migration
4. Test migration with one user first
5. Run full migration

---

## Support

If you encounter issues:
1. Check console logs for specific error messages
2. Run `verifyTestGlobals()` to check setup
3. Test with a single user using `testSpecificUser()`
4. Review TESTING_GUIDE.md for detailed troubleshooting
5. Verify your sheet structure matches requirements
