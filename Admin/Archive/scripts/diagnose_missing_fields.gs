/**
 * Diagnostic test to verify why E_delta_1_std_12 and E_slope_6_std_12 are missing
 * This will help identify if the issue is in calculation or output formatting
 */
function diagnose_new_user_evaluation() {
  const emailAddress = "yuki_tajiri@ulvac.com";

  console.log("=".repeat(70));
  console.log("DIAGNOSTIC TEST FOR MISSING FIELDS");
  console.log("=".repeat(70));

  // Step 1: Check if ENGAGEMENT_RESULT_FIELDS includes our fields
  console.log("\n1. Checking ENGAGEMENT_RESULT_FIELDS constant:");
  if (typeof ENGAGEMENT_RESULT_FIELDS !== 'undefined') {
    console.log(`   Fields defined: ${ENGAGEMENT_RESULT_FIELDS.length}`);
    const hasE_delta = ENGAGEMENT_RESULT_FIELDS.includes("E_delta_1_std_12");
    const hasE_slope = ENGAGEMENT_RESULT_FIELDS.includes("E_slope_6_std_12");
    console.log(`   Contains E_delta_1_std_12: ${hasE_delta}`);
    console.log(`   Contains E_slope_6_std_12: ${hasE_slope}`);

    if (!hasE_delta || !hasE_slope) {
      console.error("   ERROR: Fields missing from ENGAGEMENT_RESULT_FIELDS!");
      console.log("   All fields:", ENGAGEMENT_RESULT_FIELDS.join(", "));
    }
  } else {
    console.error("   ERROR: ENGAGEMENT_RESULT_FIELDS is undefined!");
  }

  // Step 2: Get user data and analyze
  console.log(`\n2. Testing with user: ${emailAddress}`);

  const testSheet = RatingSheetforTest;
  const allData = testSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const colMailAddress = header.indexOf("mail address");
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const colEngagement = header.indexOf("engagement");

  const userRows = rows.filter(row => row[colMailAddress] === emailAddress);
  const sortedRows = userRows.sort((a, b) => {
    const yearDiff = a[colYear] - b[colYear];
    if (yearDiff !== 0) return yearDiff;
    return a[colMonth] - b[colMonth];
  });

  console.log(`   Found ${sortedRows.length} records`);

  // Display E values for reference
  const eValues = sortedRows.map(row => row[colEngagement]);
  console.log(`   E values: [${eValues.join(", ")}]`);

  // Calculate std for last 12 records manually
  if (eValues.length >= 12) {
    const last12 = eValues.slice(-12);
    const mean = last12.reduce((sum, v) => sum + v, 0) / last12.length;
    const variance = last12.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / last12.length;
    const std = Math.sqrt(variance);
    console.log(`   Manual E_std_12 calculation: ${std.toFixed(3)}`);
  }

  // Step 3: Run analyzeEngagement
  console.log("\n3. Running analyzeEngagement:");
  const dataForAnalysis = [header].concat(sortedRows);

  // Add instrumentation by temporarily modifying analyzeEngagement result
  const result = analyzeEngagement(dataForAnalysis);

  // Step 4: Check result object
  console.log("\n4. Analyzing result object:");
  console.log(`   Total properties in result: ${Object.keys(result).length}`);
  console.log(`   All result keys: ${Object.keys(result).join(", ")}`);

  console.log("\n5. Checking specific fields:");
  const fieldsToCheck = [
    "E_delta_1",
    "E_delta_1_std_12",
    "E_slope_6",
    "E_slope_6_std_12",
    "E_delta_1_prev"
  ];

  fieldsToCheck.forEach(field => {
    const exists = result.hasOwnProperty(field);
    const value = result[field];
    const type = typeof value;
    console.log(`   ${field}:`);
    console.log(`     - exists: ${exists}`);
    console.log(`     - value: ${value}`);
    console.log(`     - type: ${type}`);
    console.log(`     - isFinite: ${Number.isFinite(value)}`);
  });

  // Step 6: Check NUMERIC_RESULT_FIELDS and MID_DEPENDENT_NUMERIC_FIELDS
  console.log("\n6. Checking field classification:");
  if (typeof NUMERIC_RESULT_FIELDS !== 'undefined') {
    console.log(`   E_delta_1_std_12 in NUMERIC_RESULT_FIELDS: ${NUMERIC_RESULT_FIELDS.has("E_delta_1_std_12")}`);
    console.log(`   E_slope_6_std_12 in NUMERIC_RESULT_FIELDS: ${NUMERIC_RESULT_FIELDS.has("E_slope_6_std_12")}`);
  }

  if (typeof MID_DEPENDENT_NUMERIC_FIELDS !== 'undefined') {
    console.log(`   E_delta_1_std_12 in MID_DEPENDENT_NUMERIC_FIELDS: ${MID_DEPENDENT_NUMERIC_FIELDS.has("E_delta_1_std_12")}`);
    console.log(`   E_slope_6_std_12 in MID_DEPENDENT_NUMERIC_FIELDS: ${MID_DEPENDENT_NUMERIC_FIELDS.has("E_slope_6_std_12")}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSTIC TEST COMPLETE");
  console.log("=".repeat(70));

  return result;
}

/**
 * Test function to manually verify the calculation logic
 * This bypasses the normal flow and directly tests the calculations
 */
function test_manual_calculation() {
  console.log("\n=== MANUAL CALCULATION TEST ===\n");

  // Sample E values from the user's history
  const eValues = [24, 25, 25, 29, 20, 21, 28, 23, 27, 25, 25, 31, 32, 27, 24];

  console.log(`E values: [${eValues.join(", ")}]`);
  console.log(`Total records: ${eValues.length}`);

  // Calculate E_delta_1
  const E_delta_1 = eValues[eValues.length - 1] - eValues[eValues.length - 2];
  console.log(`\nE_delta_1 = ${eValues[eValues.length - 1]} - ${eValues[eValues.length - 2]} = ${E_delta_1}`);

  // Calculate E_std_12 for the last 12 values
  const last12 = eValues.slice(-12);
  console.log(`\nLast 12 E values: [${last12.join(", ")}]`);

  const mean = last12.reduce((sum, v) => sum + v, 0) / last12.length;
  console.log(`Mean: ${mean.toFixed(3)}`);

  const variance = last12.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / last12.length;
  const E_std_12 = Math.sqrt(variance);
  console.log(`Variance: ${variance.toFixed(3)}`);
  console.log(`E_std_12: ${E_std_12.toFixed(3)}`);

  // Calculate E_delta_1_std_12
  if (E_std_12 > 1e-9) {
    const E_delta_1_std_12 = E_delta_1 / E_std_12;
    console.log(`\nE_delta_1_std_12 = ${E_delta_1} / ${E_std_12.toFixed(3)} = ${E_delta_1_std_12.toFixed(3)}`);
  } else {
    console.log(`\nE_delta_1_std_12: Cannot calculate (E_std_12 too small)`);
  }

  // Test Theil-Sen slope for last 6 values
  const last6 = eValues.slice(-6);
  console.log(`\nLast 6 E values for slope: [${last6.join(", ")}]`);

  // Calculate all pairwise slopes
  const slopes = [];
  for (let i = 0; i < last6.length - 1; i++) {
    for (let j = i + 1; j < last6.length; j++) {
      const slope = (last6[j] - last6[i]) / (j - i);
      slopes.push(slope);
      console.log(`  Slope[${i},${j}]: (${last6[j]} - ${last6[i]}) / ${j - i} = ${slope.toFixed(3)}`);
    }
  }

  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const E_slope_6 = slopes.length % 2 === 1
    ? slopes[mid]
    : (slopes[mid - 1] + slopes[mid]) / 2;

  console.log(`\nSorted slopes: [${slopes.map(s => s.toFixed(3)).join(", ")}]`);
  console.log(`Median E_slope_6: ${E_slope_6.toFixed(3)}`);

  // Calculate E_slope_6_std_12
  if (E_std_12 > 0) {
    const E_slope_6_std_12 = E_slope_6 / E_std_12;
    console.log(`\nE_slope_6_std_12 = ${E_slope_6.toFixed(3)} / ${E_std_12.toFixed(3)} = ${E_slope_6_std_12.toFixed(3)}`);
  }

  console.log("\n=== END MANUAL CALCULATION TEST ===");
}
