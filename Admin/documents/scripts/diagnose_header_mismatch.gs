/**
 * Diagnostic script to identify header mismatch between log and rating sheet
 * This will help verify if ENGAGEMENT_RESULT_FIELDS is properly accessible
 */
function diagnoseHeaderMismatch() {
  console.log("=".repeat(70));
  console.log("DIAGNOSTIC: Header Mismatch Analysis");
  console.log("=".repeat(70));

  // Check 1: Is ENGAGEMENT_RESULT_FIELDS defined?
  console.log("\n1. Checking if ENGAGEMENT_RESULT_FIELDS is defined:");
  if (typeof ENGAGEMENT_RESULT_FIELDS !== 'undefined') {
    console.log("   ✓ ENGAGEMENT_RESULT_FIELDS is defined");
    console.log(`   Fields count: ${ENGAGEMENT_RESULT_FIELDS.length}`);
    console.log(`   Fields: ${ENGAGEMENT_RESULT_FIELDS.join(", ")}`);
  } else {
    console.error("   ✗ ENGAGEMENT_RESULT_FIELDS is NOT defined!");
    console.error("   This is the ROOT CAUSE of the mismatch!");
  }

  // Check 2: What does getResultHeaders() return?
  console.log("\n2. Checking what getResultHeaders() returns:");
  try {
    const headers = getResultHeaders();
    console.log(`   Returned fields count: ${headers.length}`);
    console.log(`   Returned fields: ${headers.join(", ")}`);

    // Compare with ENGAGEMENT_RESULT_FIELDS
    if (typeof ENGAGEMENT_RESULT_FIELDS !== 'undefined') {
      const match = JSON.stringify(headers) === JSON.stringify(ENGAGEMENT_RESULT_FIELDS);
      if (match) {
        console.log("   ✓ Headers match ENGAGEMENT_RESULT_FIELDS");
      } else {
        console.error("   ✗ Headers DO NOT match ENGAGEMENT_RESULT_FIELDS!");
        console.error("   Using fallback headers instead!");
      }
    }
  } catch (error) {
    console.error(`   Error calling getResultHeaders(): ${error.message}`);
  }

  // Check 3: What headers are currently in the RatingSheet?
  console.log("\n3. Checking current headers in RatingSheet:");
  try {
    setGlobals();  // Ensure globals are set
    const RESULT_START_COLUMN = 10;  // Column J (1-indexed)
    const lastColumn = RatingSheet.getLastColumn();
    const headerRow = RatingSheet.getRange(1, 1, 1, lastColumn).getValues()[0];

    console.log(`   Total columns in sheet: ${lastColumn}`);
    console.log(`   First 9 columns: ${headerRow.slice(0, 9).join(", ")}`);
    console.log(`   Result columns (from col ${RESULT_START_COLUMN}): ${headerRow.slice(9).join(", ")}`);

    const resultHeaders = headerRow.slice(9);
    console.log(`   Number of result columns: ${resultHeaders.length}`);

    // Compare with what getResultHeaders() returns
    const expectedHeaders = getResultHeaders();
    console.log(`   Expected result columns: ${expectedHeaders.length}`);

    if (resultHeaders.length !== expectedHeaders.length) {
      console.error(`   ✗ Column count mismatch! Sheet has ${resultHeaders.length}, expected ${expectedHeaders.length}`);
    }

    // Check for mismatches
    const mismatches = [];
    for (let i = 0; i < Math.max(resultHeaders.length, expectedHeaders.length); i++) {
      if (resultHeaders[i] !== expectedHeaders[i]) {
        mismatches.push(`   Position ${i}: Sheet="${resultHeaders[i]}" vs Expected="${expectedHeaders[i]}"`);
      }
    }

    if (mismatches.length > 0) {
      console.error(`\n   ✗ Found ${mismatches.length} header mismatches:`);
      mismatches.forEach(m => console.error(m));
    } else {
      console.log("   ✓ All headers match!");
    }

  } catch (error) {
    console.error(`   Error checking RatingSheet: ${error.message}`);
  }

  // Check 4: Simulate a write operation
  console.log("\n4. Simulating data write:");
  try {
    const testData = {
      level: "High",
      trend_base: "上昇中",
      trend_recent: "上昇",
      trend_refined: "上昇継続",
      big_change: "",
      stability_6: "安定",
      strength_short: "V, D",
      weakness_short: "",
      strength_mid: "V",
      weakness_mid: "",
      E_delta_1: 2.5,
      E_delta_1_prev: 1.2,
      E_delta_1_std_12: 0.8,
      E_slope_6: 0.3,
      E_slope_6_std_12: 0.1,
      V_delta_1: 1.0,
      D_delta_1: 0.8,
      A_delta_1: 0.7,
      V_slope_6: 0.15,
      D_slope_6: 0.12,
      A_slope_6: 0.10
    };

    const fields = getResultHeaders();
    const valuesRow = fields.map(field =>
      testData[field] !== undefined ? testData[field] : ""
    );

    console.log("   Fields used for writing:");
    fields.forEach((field, idx) => {
      console.log(`     ${field}: ${valuesRow[idx]}`);
    });

    // Check for missing values
    const missingValues = fields.filter((field, idx) =>
      testData.hasOwnProperty(field) && valuesRow[idx] === ""
    );

    if (missingValues.length > 0) {
      console.error(`   ✗ Missing values for fields: ${missingValues.join(", ")}`);
    }

  } catch (error) {
    console.error(`   Error simulating write: ${error.message}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSIS COMPLETE");
  console.log("=".repeat(70));
}

/**
 * Compare what's logged vs what's in the sheet for a specific user
 */
function compareLogVsSheet(emailAddress) {
  console.log(`\nComparing log vs sheet for: ${emailAddress}`);
  console.log("=".repeat(70));

  setGlobals();

  // Get user's latest record from sheet
  const allData = RatingSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const mailIndex = header.indexOf("mail address");
  const userRows = rows.filter(row => row[mailIndex] === emailAddress);

  if (userRows.length === 0) {
    console.error(`No data found for ${emailAddress}`);
    return;
  }

  // Get latest row
  const latestRow = userRows[userRows.length - 1];
  console.log("\nLatest row in sheet:");
  header.forEach((col, idx) => {
    if (idx >= 9) {  // Result columns start at index 9
      console.log(`  ${col}: ${latestRow[idx]}`);
    }
  });

  // Run analysis to see what the log would show
  console.log("\nRunning analysis to see what log shows:");
  const yearIdx = header.indexOf("year");
  const monthIdx = header.indexOf("month");

  const sortedUserRows = userRows.sort((a, b) => {
    const yearDiff = a[yearIdx] - b[yearIdx];
    if (yearDiff !== 0) return yearDiff;
    return a[monthIdx] - b[monthIdx];
  });

  const analyzeInput = [header].concat(sortedUserRows);
  const result = analyzeEngagement(analyzeInput);

  console.log("\nAnalysis result (what should be logged and written):");
  Object.keys(result).forEach(key => {
    console.log(`  ${key}: ${result[key]}`);
  });

  // Compare
  console.log("\nComparison:");
  const RESULT_START_COLUMN_IDX = 9;  // 0-indexed
  const resultFields = getResultHeaders();

  const differences = [];
  resultFields.forEach((field, idx) => {
    const sheetValue = latestRow[RESULT_START_COLUMN_IDX + idx];
    const logValue = result[field];

    if (sheetValue !== logValue) {
      differences.push({
        field,
        sheetValue,
        logValue,
        sheetColumn: header[RESULT_START_COLUMN_IDX + idx]
      });
    }
  });

  if (differences.length === 0) {
    console.log("✓ No differences found! Log and sheet match perfectly.");
  } else {
    console.error(`✗ Found ${differences.length} differences:`);
    differences.forEach(diff => {
      console.error(`  ${diff.field}:`);
      console.error(`    Sheet column: "${diff.sheetColumn}"`);
      console.error(`    Sheet value: ${diff.sheetValue}`);
      console.error(`    Log value: ${diff.logValue}`);
    });
  }

  console.log("=".repeat(70));
}
