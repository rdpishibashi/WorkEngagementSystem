/**
 * Verification and Repair Script for Rating Sheet
 *
 * This script:
 * 1. Reads all records from the rating sheet
 * 2. Recalculates the evaluation results for each record
 * 3. Compares with what's currently in the sheet
 * 4. Reports discrepancies
 * 5. Optionally repairs the wrong data
 *
 * USAGE:
 * - Run verifyAllRatings() to check all records (read-only, safe)
 * - Run repairRatings() to fix any discrepancies found
 */

/**
 * Verify all ratings without making changes
 * This is safe to run - it only reads and reports
 */
function verifyAllRatings() {
  console.log("=".repeat(70));
  console.log("VERIFICATION: Checking all rating records");
  console.log("=".repeat(70));

  setGlobals();

  const allData = RatingSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  console.log(`Total records to check: ${rows.length}`);

  // Get column indices
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const colMail = header.indexOf("mail address");
  const RESULT_START_COL_IDX = 9;  // 0-indexed (column J)

  // Group by user
  const userDataMap = {};
  rows.forEach((row, rowIndex) => {
    const mail = row[colMail];
    if (!mail) return;

    if (!userDataMap[mail]) {
      userDataMap[mail] = [];
    }
    userDataMap[mail].push({
      row: row,
      rowIndex: rowIndex + 2  // +2 because: +1 for header, +1 for 1-based indexing
    });
  });

  const users = Object.keys(userDataMap);
  console.log(`Total unique users: ${users.length}\n`);

  const discrepancies = [];

  users.forEach((mail, idx) => {
    const userData = userDataMap[mail];

    // Sort by year and month
    const sortedData = userData.sort((a, b) => {
      const yearDiff = a.row[colYear] - b.row[colYear];
      if (yearDiff !== 0) return yearDiff;
      return a.row[colMonth] - b.row[colMonth];
    });

    // For each record of this user, calculate what the results SHOULD be
    sortedData.forEach((record, recordIdx) => {
      // Get all data up to and including this record
      const dataUpToThisPoint = sortedData.slice(0, recordIdx + 1).map(r => r.row);
      const analyzeInput = [header].concat(dataUpToThisPoint);

      // Calculate expected results
      const expectedResults = analyzeEngagement(analyzeInput);

      // Get actual results from sheet
      const actualRow = record.row;
      const resultFields = getResultHeaders();

      // Compare each field
      let hasDiscrepancy = false;
      const fieldDiscrepancies = [];

      resultFields.forEach((field, fieldIdx) => {
        const sheetColIdx = RESULT_START_COL_IDX + fieldIdx;
        const actualValue = actualRow[sheetColIdx];
        const expectedValue = expectedResults[field];

        // Normalize for comparison (handle empty strings, undefined, null)
        const normalizeValue = (val) => {
          if (val === undefined || val === null || val === "") return "";
          if (typeof val === "number") return Number(val.toFixed(2));
          return String(val);
        };

        const normalizedActual = normalizeValue(actualValue);
        const normalizedExpected = normalizeValue(expectedValue);

        if (normalizedActual !== normalizedExpected) {
          hasDiscrepancy = true;
          fieldDiscrepancies.push({
            field: field,
            sheetColumn: header[sheetColIdx],
            actual: actualValue,
            expected: expectedValue
          });
        }
      });

      if (hasDiscrepancy) {
        discrepancies.push({
          rowNumber: record.rowIndex,
          email: mail,
          year: actualRow[colYear],
          month: actualRow[colMonth],
          fields: fieldDiscrepancies
        });
      }
    });

    // Progress indicator
    if ((idx + 1) % 10 === 0) {
      console.log(`Checked ${idx + 1}/${users.length} users...`);
    }
  });

  console.log("\n" + "=".repeat(70));
  console.log("VERIFICATION RESULTS");
  console.log("=".repeat(70));

  if (discrepancies.length === 0) {
    console.log("✓ No discrepancies found! All records are correct.");
  } else {
    console.error(`✗ Found ${discrepancies.length} records with discrepancies:\n`);

    discrepancies.forEach((disc, idx) => {
      console.error(`${idx + 1}. Row ${disc.rowNumber}: ${disc.email} (${disc.year}-${disc.month})`);
      console.error(`   Mismatched fields: ${disc.fields.length}`);
      disc.fields.forEach(field => {
        console.error(`   - ${field.field}:`);
        console.error(`     Sheet: ${field.actual} (column: "${field.sheetColumn}")`);
        console.error(`     Expected: ${field.expected}`);
      });
      console.error("");
    });
  }

  console.log("=".repeat(70));

  return discrepancies;
}

/**
 * Repair all discrepancies found
 * WARNING: This modifies the sheet!
 */
function repairRatings(dryRun = true) {
  console.log("=".repeat(70));
  console.log(`REPAIR MODE: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will modify sheet)"}`);
  console.log("=".repeat(70));

  // First, verify and get discrepancies
  const discrepancies = verifyAllRatings();

  if (discrepancies.length === 0) {
    console.log("\nNothing to repair!");
    return;
  }

  console.log(`\nFound ${discrepancies.length} records to repair.`);

  if (dryRun) {
    console.log("\nDRY RUN - No changes will be made.");
    console.log("To actually repair, run: repairRatings(false)");
    return;
  }

  // Perform repairs
  console.log("\nStarting repairs...");

  setGlobals();
  const allData = RatingSheet.getDataRange().getValues();
  const header = allData[0];
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const colMail = header.indexOf("mail address");
  const RESULT_START_COL = 10;  // 1-indexed (column J)

  discrepancies.forEach((disc, idx) => {
    console.log(`\nRepairing ${idx + 1}/${discrepancies.length}: Row ${disc.rowNumber} (${disc.email})`);

    // Get all records for this user up to this point
    const rows = allData.slice(1);
    const userRows = rows.filter(row => row[colMail] === disc.email);

    const sortedRows = userRows.sort((a, b) => {
      const yearDiff = a[colYear] - b[colYear];
      if (yearDiff !== 0) return yearDiff;
      return a[colMonth] - b[colMonth];
    });

    // Find which record this is (chronologically)
    const recordIndex = sortedRows.findIndex(row =>
      row[colYear] === disc.year && row[colMonth] === disc.month
    );

    if (recordIndex === -1) {
      console.error(`  ERROR: Could not find record in sorted data`);
      return;
    }

    // Get data up to and including this record
    const dataUpToThisPoint = sortedRows.slice(0, recordIndex + 1);
    const analyzeInput = [header].concat(dataUpToThisPoint);

    // Recalculate
    const correctResults = analyzeEngagement(analyzeInput);

    // Prepare values to write
    const resultFields = getResultHeaders();
    const valuesRow = resultFields.map(field =>
      correctResults[field] !== undefined ? correctResults[field] : ""
    );

    // Write to sheet
    RatingSheet.getRange(disc.rowNumber, RESULT_START_COL, 1, valuesRow.length).setValues([valuesRow]);

    console.log(`  ✓ Repaired ${disc.fields.length} fields`);
  });

  console.log("\n" + "=".repeat(70));
  console.log("REPAIR COMPLETE");
  console.log("=".repeat(70));
  console.log(`Repaired ${discrepancies.length} records.`);
  console.log("\nRun verifyAllRatings() again to confirm all issues are fixed.");
}

/**
 * Verify a specific user's ratings
 */
function verifyUserRatings(emailAddress) {
  console.log(`Verifying ratings for: ${emailAddress}`);
  console.log("=".repeat(70));

  setGlobals();

  const allData = RatingSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const colMail = header.indexOf("mail address");
  const RESULT_START_COL_IDX = 9;

  // Get user records
  const userRows = rows
    .map((row, idx) => ({ row, rowIndex: idx + 2 }))
    .filter(r => r.row[colMail] === emailAddress);

  if (userRows.length === 0) {
    console.error(`No records found for ${emailAddress}`);
    return;
  }

  console.log(`Found ${userRows.length} records for this user\n`);

  // Sort chronologically
  const sortedRows = userRows.sort((a, b) => {
    const yearDiff = a.row[colYear] - b.row[colYear];
    if (yearDiff !== 0) return yearDiff;
    return a.row[colMonth] - b.row[colMonth];
  });

  const resultFields = getResultHeaders();
  let discrepancyCount = 0;

  sortedRows.forEach((record, idx) => {
    const dataUpToHere = sortedRows.slice(0, idx + 1).map(r => r.row);
    const analyzeInput = [header].concat(dataUpToHere);
    const expectedResults = analyzeEngagement(analyzeInput);

    const actualRow = record.row;
    const year = actualRow[colYear];
    const month = actualRow[colMonth];

    console.log(`Record ${idx + 1}: ${year}-${String(month).padStart(2, '0')} (Sheet row ${record.rowIndex})`);

    let hasDiscrepancy = false;
    resultFields.forEach((field, fieldIdx) => {
      const sheetColIdx = RESULT_START_COL_IDX + fieldIdx;
      const actualValue = actualRow[sheetColIdx];
      const expectedValue = expectedResults[field];

      const normalizeValue = (val) => {
        if (val === undefined || val === null || val === "") return "";
        if (typeof val === "number") return Number(val.toFixed(2));
        return String(val);
      };

      const normalizedActual = normalizeValue(actualValue);
      const normalizedExpected = normalizeValue(expectedValue);

      if (normalizedActual !== normalizedExpected) {
        if (!hasDiscrepancy) {
          console.error(`  ✗ DISCREPANCY FOUND:`);
          hasDiscrepancy = true;
          discrepancyCount++;
        }
        console.error(`    ${field}: "${actualValue}" → should be "${expectedValue}"`);
      }
    });

    if (!hasDiscrepancy) {
      console.log(`  ✓ Correct`);
    }
    console.log("");
  });

  console.log("=".repeat(70));
  if (discrepancyCount === 0) {
    console.log("✓ All records for this user are correct!");
  } else {
    console.error(`✗ Found discrepancies in ${discrepancyCount} records`);
    console.log("\nTo repair, run: repairRatings(false)");
  }
}

/**
 * Quick check - just count how many records have discrepancies
 */
function quickVerify() {
  console.log("Running quick verification...");
  const discrepancies = verifyAllRatings();

  console.log("\n" + "=".repeat(70));
  console.log("QUICK SUMMARY");
  console.log("=".repeat(70));

  if (discrepancies.length === 0) {
    console.log("✓ All records are correct!");
  } else {
    console.error(`✗ Found ${discrepancies.length} records with discrepancies`);
    console.log("\nTo see details, review the output above.");
    console.log("To repair, run: repairRatings(false)");
  }

  return discrepancies.length;
}
