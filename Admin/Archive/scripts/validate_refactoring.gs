/**
 * Validation Script for Report Project Refactoring
 *
 * This script validates that the refactoring changes are working correctly:
 * 1. New fields (E_std_6, E_std_12, E_momentum_3) are properly calculated
 * 2. Field order matches specification
 * 3. Individual sheets match rating sheet structure
 * 4. No regression in existing functionality
 *
 * USAGE:
 * - Run validateRefactoring() to check all changes
 * - Run testNewFields() to test only the new fields
 * - Run compareSheetStructures() to verify sheet consistency
 */

function validateRefactoring() {
  console.log("=".repeat(70));
  console.log("VALIDATING REFACTORING CHANGES");
  console.log("=".repeat(70));

  const results = {
    fieldDefinition: false,
    fieldOrder: false,
    newFieldCalculation: false,
    sheetStructure: false,
    noRegression: false
  };

  // Test 1: Verify ENGAGEMENT_RESULT_FIELDS has correct fields
  console.log("\n1. Checking ENGAGEMENT_RESULT_FIELDS definition...");
  const expectedFields = [
    "level", "trend_base", "trend_recent", "trend_refined", "big_change", "stability_6",
    "strength_short", "weakness_short", "strength_mid", "weakness_mid",
    "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",
    "E_std_6", "E_std_12",
    "V_delta_1", "D_delta_1", "A_delta_1",
    "E_momentum_3", "E_slope_6", "E_slope_6_std_12",
    "V_slope_6", "D_slope_6", "A_slope_6"
  ];

  if (typeof ENGAGEMENT_RESULT_FIELDS === 'undefined') {
    console.error("   ✗ ENGAGEMENT_RESULT_FIELDS is not defined!");
  } else if (ENGAGEMENT_RESULT_FIELDS.length !== 24) {
    console.error(`   ✗ Expected 24 fields, got ${ENGAGEMENT_RESULT_FIELDS.length}`);
  } else if (JSON.stringify(ENGAGEMENT_RESULT_FIELDS) !== JSON.stringify(expectedFields)) {
    console.error("   ✗ Field order doesn't match specification");
    console.error(`   Expected: ${expectedFields.join(", ")}`);
    console.error(`   Got: ${ENGAGEMENT_RESULT_FIELDS.join(", ")}`);
  } else {
    console.log("   ✓ ENGAGEMENT_RESULT_FIELDS has 24 fields in correct order");
    results.fieldDefinition = true;
  }

  // Test 2: Verify field classification (NUMERIC_RESULT_FIELDS)
  console.log("\n2. Checking field classification...");
  const expectedNumericFields = [
    "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",
    "E_std_6", "E_std_12",
    "V_delta_1", "D_delta_1", "A_delta_1",
    "E_momentum_3", "E_slope_6", "E_slope_6_std_12",
    "V_slope_6", "D_slope_6", "A_slope_6"
  ];

  const missingNumeric = expectedNumericFields.filter(f => !NUMERIC_RESULT_FIELDS.has(f));
  if (missingNumeric.length > 0) {
    console.error(`   ✗ Missing from NUMERIC_RESULT_FIELDS: ${missingNumeric.join(", ")}`);
  } else {
    console.log("   ✓ All numeric fields properly classified");
  }

  const expectedMidDependent = ["E_std_6", "E_std_12", "E_momentum_3", "E_slope_6", "E_slope_6_std_12", "V_slope_6", "D_slope_6", "A_slope_6"];
  const missingMidDep = expectedMidDependent.filter(f => !MID_DEPENDENT_NUMERIC_FIELDS.has(f));
  if (missingMidDep.length > 0) {
    console.error(`   ✗ Missing from MID_DEPENDENT_NUMERIC_FIELDS: ${missingMidDep.join(", ")}`);
  } else {
    console.log("   ✓ All mid-dependent fields properly classified");
    results.fieldOrder = true;
  }

  // Test 3: Test new field calculation
  console.log("\n3. Testing new field calculation...");
  const testResult = testNewFields();
  results.newFieldCalculation = testResult;

  // Test 4: Verify sheet structure consistency
  console.log("\n4. Checking sheet structure...");
  const sheetResult = compareSheetStructures();
  results.sheetStructure = sheetResult;

  // Test 5: Regression test - ensure existing functionality still works
  console.log("\n5. Running regression tests...");
  const regressionResult = testExistingFunctionality();
  results.noRegression = regressionResult;

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("VALIDATION SUMMARY");
  console.log("=".repeat(70));

  const allPassed = Object.values(results).every(r => r === true);

  Object.keys(results).forEach(test => {
    const status = results[test] ? "✓ PASS" : "✗ FAIL";
    console.log(`${status}: ${test}`);
  });

  console.log("\n" + "=".repeat(70));
  if (allPassed) {
    console.log("✓ ALL TESTS PASSED - Refactoring is successful!");
  } else {
    console.error("✗ SOME TESTS FAILED - Review errors above");
  }
  console.log("=".repeat(70));

  return results;
}

/**
 * Test that new fields are calculated correctly
 */
function testNewFields() {
  console.log("   Testing E_std_6, E_std_12, E_momentum_3 calculation...");

  try {
    // Create test data
    const header = ["year", "month", "day", "date", "mail address", "engagement", "vigor", "dedication", "absorption"];
    const testRows = [
      [2024, 1, 15, "2024-01-15", "test@example.com", 24, 8, 8, 8],
      [2024, 2, 15, "2024-02-15", "test@example.com", 25, 9, 8, 8],
      [2024, 3, 15, "2024-03-15", "test@example.com", 27, 9, 9, 9],
      [2024, 4, 15, "2024-04-15", "test@example.com", 26, 9, 8, 9],
      [2024, 5, 15, "2024-05-15", "test@example.com", 28, 10, 9, 9],
      [2024, 6, 15, "2024-06-15", "test@example.com", 30, 10, 10, 10],
    ];

    const testData = [header].concat(testRows);
    const result = analyzeEngagement(testData);

    // Check that new fields exist
    if (!result.hasOwnProperty('E_std_6')) {
      console.error("      ✗ E_std_6 not in result");
      return false;
    }
    if (!result.hasOwnProperty('E_std_12')) {
      console.error("      ✗ E_std_12 not in result");
      return false;
    }
    if (!result.hasOwnProperty('E_momentum_3')) {
      console.error("      ✗ E_momentum_3 not in result");
      return false;
    }

    // Check that values are numeric (or empty for insufficient history)
    const e_std_6 = result.E_std_6;
    const e_std_12 = result.E_std_12;
    const e_momentum_3 = result.E_momentum_3;

    console.log(`      E_std_6: ${e_std_6} (type: ${typeof e_std_6})`);
    console.log(`      E_std_12: ${e_std_12} (type: ${typeof e_std_12})`);
    console.log(`      E_momentum_3: ${e_momentum_3} (type: ${typeof e_momentum_3})`);

    // With 6 records, we should have valid values
    if (e_std_6 === "" || !Number.isFinite(e_std_6)) {
      console.error("      ✗ E_std_6 should be numeric with 6 records");
      return false;
    }

    if (e_momentum_3 === "" || !Number.isFinite(e_momentum_3)) {
      console.error("      ✗ E_momentum_3 should be numeric with 6 records");
      return false;
    }

    // E_std_12 might be empty since we only have 6 records
    // This is expected behavior

    console.log("   ✓ New fields calculated correctly");
    return true;

  } catch (error) {
    console.error(`   ✗ Error testing new fields: ${error.message}`);
    return false;
  }
}

/**
 * Compare rating sheet and individual sheet structures
 */
function compareSheetStructures() {
  try {
    setGlobals();

    // Get result headers
    const resultHeaders = getResultHeaders();

    console.log(`   Result headers: ${resultHeaders.length} fields`);
    console.log(`   Expected: 24 fields`);

    if (resultHeaders.length !== 24) {
      console.error(`   ✗ Expected 24 result headers, got ${resultHeaders.length}`);
      return false;
    }

    // Verify getIndividualHeader includes all result headers
    const individualHeader = getIndividualHeader();
    const baseHeaderLength = 9; // year, month, day, date, mail, engagement, vigor, dedication, absorption

    if (individualHeader.length !== baseHeaderLength + 24) {
      console.error(`   ✗ Individual header should have ${baseHeaderLength + 24} columns, got ${individualHeader.length}`);
      return false;
    }

    console.log("   ✓ Sheet structures are consistent");
    return true;

  } catch (error) {
    console.error(`   ✗ Error comparing sheet structures: ${error.message}`);
    return false;
  }
}

/**
 * Test existing functionality to ensure no regression
 */
function testExistingFunctionality() {
  console.log("   Testing existing fields still work correctly...");

  try {
    // Create test data with known values
    const header = ["year", "month", "day", "date", "mail address", "engagement", "vigor", "dedication", "absorption"];
    const testRows = [
      [2024, 1, 15, "2024-01-15", "test@example.com", 20, 6, 7, 7],
      [2024, 2, 15, "2024-02-15", "test@example.com", 25, 8, 8, 9],
      [2024, 3, 15, "2024-03-15", "test@example.com", 30, 10, 10, 10],
    ];

    const testData = [header].concat(testRows);
    const result = analyzeEngagement(testData);

    // Test existing fields
    const requiredFields = ["level", "trend_base", "trend_recent", "trend_refined", "big_change",
                           "E_delta_1", "V_delta_1", "D_delta_1", "A_delta_1"];

    const missingFields = requiredFields.filter(f => !result.hasOwnProperty(f));
    if (missingFields.length > 0) {
      console.error(`      ✗ Missing existing fields: ${missingFields.join(", ")}`);
      return false;
    }

    // Verify basic calculations
    if (result.E_delta_1 !== 5) {  // 30 - 25 = 5
      console.error(`      ✗ E_delta_1 calculation incorrect: expected 5, got ${result.E_delta_1}`);
      return false;
    }

    if (result.V_delta_1 !== 2) {  // 10 - 8 = 2
      console.error(`      ✗ V_delta_1 calculation incorrect: expected 2, got ${result.V_delta_1}`);
      return false;
    }

    console.log("   ✓ Existing functionality works correctly");
    return true;

  } catch (error) {
    console.error(`   ✗ Error testing existing functionality: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    return false;
  }
}

/**
 * Quick test for a specific user
 */
function validateUserData(emailAddress) {
  console.log(`\nValidating data for: ${emailAddress}`);
  console.log("=".repeat(70));

  setGlobals();

  const allData = RatingSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const colMail = header.indexOf("mail address");
  const userRows = rows.filter(row => row[colMail] === emailAddress);

  if (userRows.length === 0) {
    console.error(`No data found for ${emailAddress}`);
    return;
  }

  console.log(`Found ${userRows.length} records`);

  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");

  const sortedRows = userRows.sort((a, b) => {
    const yearDiff = a[colYear] - b[colYear];
    if (yearDiff !== 0) return yearDiff;
    return a[colMonth] - b[colMonth];
  });

  const analyzeInput = [header].concat(sortedRows);
  const result = analyzeEngagement(analyzeInput);

  console.log("\nAnalysis Results:");
  console.log(`  Level: ${result.level}`);
  console.log(`  Trend Refined: ${result.trend_refined}`);
  console.log("\nNew Fields:");
  console.log(`  E_std_6: ${result.E_std_6}`);
  console.log(`  E_std_12: ${result.E_std_12}`);
  console.log(`  E_momentum_3: ${result.E_momentum_3}`);
  console.log("\nExisting Fields:");
  console.log(`  E_delta_1: ${result.E_delta_1}`);
  console.log(`  E_slope_6: ${result.E_slope_6}`);

  console.log("\n" + "=".repeat(70));
}
