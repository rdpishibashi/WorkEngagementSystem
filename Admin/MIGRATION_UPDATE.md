# Migration Script Update Instructions

After testing the new `evaluate.gs` logic, you'll need to update `migration.gs` to match the new field structure.

## Required Changes to migration.gs

### 1. Update the `updateRowWithAnalysisResults` function

**Location:** `Admin/migration.gs`, lines 90-148

**Replace the function with this updated version:**

```javascript
function updateRowWithAnalysisResults(sheet, rowIndex, results) {
  const formatValue = (val) => {
    if (val === "" || val === null || val === undefined) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number") {
      return Number.isInteger(val) ? val : Number(val.toFixed(2));
    }
    return val;
  };

  // Updated field list to match new ENGAGEMENT_RESULT_FIELDS
  const values = [
    results.level || "",
    results.trend_base || "",
    results.trend_recent || "",
    results.trend_refined || "",
    results.change_tag || "",
    results.stability || "",
    results.strength_short || "",
    results.weakness_short || "",
    results.strength_mid || "",
    results.weakness_mid || "",
    formatValue(results.E_delta_1),
    formatValue(results.E_delta_1_prev),
    formatValue(results.E_delta_1_std_12),      // NEW
    formatValue(results.E_slope_6),
    formatValue(results.E_slope_6_std_12),      // NEW
    formatValue(results.V_delta_1),
    formatValue(results.D_delta_1),
    formatValue(results.A_delta_1),
    formatValue(results.V_slope_6),
    formatValue(results.D_slope_6),
    formatValue(results.A_slope_6)
  ];

  // Write to columns 10 onwards (0: year, 1: month, 2: day, 3: date, 4: mail address, 5-8: engagement data, 9+: analysis results)
  // Column 10 in 1-indexed = column 9 in 0-indexed (level column)
  sheet.getRange(rowIndex, 10, 1, values.length).setValues([values]);
}
```

### 2. Update Your Sheet Header Row

**Before running migration**, ensure your sheet has these column headers starting from column 10:

| Col | Header Name |
|-----|-------------|
| 10  | level |
| 11  | trend_base |
| 12  | trend_recent |
| 13  | trend_refined |
| 14  | change_tag |
| 15  | stability |
| 16  | strength_short |
| 17  | weakness_short |
| 18  | strength_mid |
| 19  | weakness_mid |
| 20  | E_delta_1 |
| 21  | E_delta_1_prev |
| 22  | E_delta_1_std_12 | ← NEW
| 23  | E_slope_6 |
| 24  | E_slope_6_std_12 | ← NEW
| 25  | V_delta_1 |
| 26  | D_delta_1 |
| 27  | A_delta_1 |
| 28  | V_slope_6 |
| 29  | D_slope_6 |
| 30  | A_slope_6 |

**Total: 21 columns** (was 43 columns before)

### 3. Remove Old analyzeEngagement from migration.gs

The `migration.gs` file contains a copy of the old `analyzeEngagement` function (lines 252-1051).

**Options:**

**Option A: Use evaluate.gs directly**
- Delete lines 150-1051 in migration.gs (all the duplicated functions)
- Ensure evaluate.gs is loaded in your Apps Script project
- The `analyzeEngagement` function will be available globally

**Option B: Keep it separate (not recommended)**
- If you must keep functions in migration.gs, copy the ENTIRE updated evaluate.gs content
- This creates maintenance burden as you need to update two places

**Recommended: Option A** - Delete the duplicate code and rely on evaluate.gs

### 4. Update Column Count Check

If your sheet validation checks the number of columns, update it:

**Old:** Expected 51+ columns (9 input + 43 analysis fields)
**New:** Expected 30 columns (9 input + 21 analysis fields)

---

## Testing the Migration Update

### Step 1: Backup Your Data
```javascript
// Create a backup sheet
function createBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName("RatingSS");
  const backupName = "RatingSS_Backup_" + new Date().toISOString().slice(0, 10);
  sourceSheet.copyTo(ss).setName(backupName);
  console.log("Backup created: " + backupName);
}
```

### Step 2: Update Sheet Headers

Manually update column headers in your sheet OR use this script:

```javascript
function updateSheetHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("RatingSS");

  const newHeaders = [
    "level",
    "trend_base",
    "trend_recent",
    "trend_refined",
    "change_tag",
    "stability",
    "strength_short",
    "weakness_short",
    "strength_mid",
    "weakness_mid",
    "E_delta_1",
    "E_delta_1_prev",
    "E_delta_1_std_12",
    "E_slope_6",
    "E_slope_6_std_12",
    "V_delta_1",
    "D_delta_1",
    "A_delta_1",
    "V_slope_6",
    "D_slope_6",
    "A_slope_6"
  ];

  // Write headers starting at column 10
  sheet.getRange(1, 10, 1, newHeaders.length).setValues([newHeaders]);

  // Optional: Clear old columns (31-51) if they exist
  const lastCol = sheet.getLastColumn();
  if (lastCol > 30) {
    sheet.getRange(1, 31, sheet.getMaxRows(), lastCol - 30).clearContent();
  }

  console.log("Headers updated!");
}
```

### Step 3: Test Migration on One User

```javascript
function testMigrationOneUser(emailAddress) {
  console.log("Testing migration for: " + emailAddress);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("RatingSS");
  const allData = sheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const colMailAddress = header.indexOf("mail address");
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");

  // Find user rows
  const userRows = rows.map((row, idx) => ({ row: row, sheetRow: idx + 2 }))
                       .filter(item => item.row[colMailAddress] === emailAddress);

  if (userRows.length === 0) {
    console.error("User not found!");
    return;
  }

  console.log(`Found ${userRows.length} rows for ${emailAddress}`);

  // Sort by date
  const sortedData = userRows.map(item => item)
    .sort((a, b) => {
      const yearDiff = a.row[colYear] - b.row[colYear];
      if (yearDiff !== 0) return yearDiff;
      return a.row[colMonth] - b.row[colMonth];
    });

  // Process last row (latest)
  const latestItem = sortedData[sortedData.length - 1];
  const dataUpToNow = [header].concat(sortedData.map(x => x.row));

  // Analyze
  const result = analyzeEngagement(dataUpToNow);

  console.log("Analysis result:", JSON.stringify(result, null, 2));

  // Update the row
  updateRowWithAnalysisResults(sheet, latestItem.sheetRow, result);

  console.log(`Updated row ${latestItem.sheetRow}`);
  console.log("Check the sheet to verify the update!");
}
```

Run: `testMigrationOneUser("user@example.com")`

### Step 4: Run Full Migration

Once single-user test passes:

```javascript
// Run the full migration (from migration.gs)
migrateRatingSSToNewFormat()
```

**Monitor progress:**
- Check console logs every 10 rows
- Verify no errors
- Check a few random rows in the sheet

---

## Verification After Migration

### Quick Checks

1. **Column Count**
   - Analysis columns: 10-30 (21 columns)
   - Should see data in all 21 columns

2. **New Fields Present**
   - Column 22 (E_delta_1_std_12) has numeric values
   - Column 24 (E_slope_6_std_12) has numeric values

3. **Trend Categories**
   - Column 12 (trend_recent) shows new values like "急上昇", "連続上昇"
   - Column 13 (trend_refined) shows variety of patterns

4. **No Errors**
   - No #ERROR! values
   - No blank rows where there should be data
   - Numeric columns have numbers (not text)

### Detailed Validation

Run this after migration:

```javascript
function validateMigration() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("RatingSS");
  const data = sheet.getDataRange().getValues();
  const header = data[0];

  // Find column indices
  const cols = {
    level: header.indexOf("level"),
    trend_base: header.indexOf("trend_base"),
    trend_recent: header.indexOf("trend_recent"),
    E_delta_1_std_12: header.indexOf("E_delta_1_std_12"),
    E_slope_6_std_12: header.indexOf("E_slope_6_std_12")
  };

  let errors = 0;
  let warnings = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Check new fields exist
    if (!row[cols.E_delta_1_std_12] && row[cols.E_delta_1_std_12] !== 0) {
      warnings++;
      if (warnings <= 5) {
        console.log(`Row ${i + 1}: E_delta_1_std_12 is empty`);
      }
    }

    // Check trend_recent has valid values
    const validTrendRecent = ["上昇", "急上昇", "連続上昇", "横ばい", "下降", "急落", "連続下降"];
    if (row[cols.trend_recent] && !validTrendRecent.includes(row[cols.trend_recent])) {
      errors++;
      if (errors <= 5) {
        console.log(`Row ${i + 1}: Invalid trend_recent value: ${row[cols.trend_recent]}`);
      }
    }
  }

  console.log("\n=== Validation Summary ===");
  console.log(`Total rows: ${data.length - 1}`);
  console.log(`Errors: ${errors}`);
  console.log(`Warnings: ${warnings}`);

  if (errors === 0) {
    console.log("✓ Migration validated successfully!");
  } else {
    console.log("⚠ Migration has errors - please review");
  }
}
```

---

## Rollback Plan

If migration fails or produces incorrect results:

```javascript
function rollbackMigration(backupSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backup = ss.getSheetByName(backupSheetName);
  const current = ss.getSheetByName("RatingSS");

  if (!backup) {
    console.error("Backup sheet not found!");
    return;
  }

  // Delete current sheet
  ss.deleteSheet(current);

  // Rename backup to RatingSS
  backup.setName("RatingSS");

  console.log("Rollback complete - restored from " + backupSheetName);
}
```

---

## Summary Checklist

- [ ] Test new evaluate.gs logic (use test_new_evaluate.gs)
- [ ] Create backup of data sheet
- [ ] Update sheet headers (columns 10-30)
- [ ] Update `updateRowWithAnalysisResults` function in migration.gs
- [ ] Remove duplicate code from migration.gs (optional but recommended)
- [ ] Test migration on one user
- [ ] Run full migration
- [ ] Validate results
- [ ] Document changes

---

## Support

If issues arise:
1. Check console logs for errors
2. Verify evaluate.gs is loaded correctly
3. Test with specific users first
4. Compare with Python output for validation
5. Use rollback if needed
