  const RatingSSforTest = SpreadsheetApp.openById("1O0CRBPEyC_PwJyI39oB-Q_0we0htV5TK1ThDwxi3_ro");
  const RatingSheetforTest = RatingSSforTest.getSheetByName("rating");

function test_new_user_evalution() {
  testSpecificUser("yuki_tajiri@ulvac.com");
}

//
// Test script for the updated evaluate.gs logic
// This script tests the new evaluation logic against your actual data
//
// USAGE:
// 1. Ensure these globals are defined (in Globals.gs or at the top of your script):
//    const RatingSSforTest = SpreadsheetApp.openById(SPREADSHEET_IDS.RATING);
//    const RatingSheetforTest = RatingSSforTest.getSheetByName("rating");
//
// 2. Run: testNewEvaluateLogic() to test with your data
//

/**
 * Verify that global sheet references are properly initialized
 * This checks if RatingSSforTest and RatingSheetforTest are available
 */
function verifyTestGlobals() {
  if (typeof RatingSSforTest === 'undefined' || !RatingSSforTest) {
    console.error("ERROR: RatingSSforTest is not defined!");
    console.log("\nPlease add these lines at the top of your script (or in Globals.gs):");
    console.log("  const RatingSSforTest = SpreadsheetApp.openById(SPREADSHEET_IDS.RATING);");
    console.log("  const RatingSheetforTest = RatingSSforTest.getSheetByName('rating');");
    return false;
  }

  if (typeof RatingSheetforTest === 'undefined' || !RatingSheetforTest) {
    console.error("ERROR: RatingSheetforTest is not defined!");
    console.log("\nPlease add this line at the top of your script (or in Globals.gs):");
    console.log("  const RatingSheetforTest = RatingSSforTest.getSheetByName('rating');");
    return false;
  }

  console.log("✓ Global sheet references are properly initialized");
  console.log(`  Sheet name: ${RatingSheetforTest.getName()}`);
  console.log(`  Rows: ${RatingSheetforTest.getLastRow()}`);
  console.log(`  Columns: ${RatingSheetforTest.getLastColumn()}`);

  return true;
}

/**
 * Main test function - Run this to test the new evaluate.gs
 *
 * This will:
 * 1. Read sample data from your test sheet
 * 2. Run the new analyzeEngagement function
 * 3. Display results in the Apps Script console
 * 4. Optionally write results to a test output sheet
 */
function testNewEvaluateLogic() {
  console.log("=== Starting New Evaluate Logic Test ===\n");

  // Verify global sheet references are initialized
  if (!verifyTestGlobals()) {
    return;
  }

  console.log(""); // Blank line for readability

  // Use the global sheet references
  const testSheet = RatingSheetforTest;

  // Read all data
  const allData = testSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  console.log(`Total rows: ${rows.length}`);
  console.log(`Header: ${header.join(", ")}`);

  // Find required columns
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const colMailAddress = header.indexOf("mail address");

  if (colYear === -1 || colMonth === -1 || colMailAddress === -1) {
    console.error("Required columns not found!");
    console.log(`year column: ${colYear}, month column: ${colMonth}, mail column: ${colMailAddress}`);
    return;
  }

  // Group data by user
  const userDataMap = {};
  rows.forEach((row, index) => {
    const address = row[colMailAddress];
    if (!address) return;

    if (!userDataMap[address]) {
      userDataMap[address] = [];
    }
    userDataMap[address].push(row);
  });

  const addresses = Object.keys(userDataMap);
  console.log(`\nTotal unique users: ${addresses.length}`);

  // Test with first 3 users (or all if less than 3)
  const testUserCount = Math.min(3, addresses.length);
  console.log(`\nTesting with ${testUserCount} users...\n`);

  const testResults = [];

  for (let i = 0; i < testUserCount; i++) {
    const address = addresses[i];
    const userRows = userDataMap[address];

    console.log(`\n${"=".repeat(60)}`);
    console.log(`User ${i + 1}: ${address}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Total records: ${userRows.length}`);

    // Sort by year and month
    const sortedRows = userRows.sort((a, b) => {
      const yearDiff = a[colYear] - b[colYear];
      if (yearDiff !== 0) return yearDiff;
      return a[colMonth] - b[colMonth];
    });

    // Prepare data for analysis (test with all user history)
    const dataForAnalysis = [header].concat(sortedRows);

    try {
      // Call the NEW analyzeEngagement function from evaluate.gs
      const result = analyzeEngagement(dataForAnalysis);

      console.log("\n--- Analysis Results (Latest) ---");
      console.log(`Level: ${result.level}`);
      console.log(`Trend Base: ${result.trend_base}`);
      console.log(`Trend Recent: ${result.trend_recent}`);
      console.log(`Trend Refined: ${result.trend_refined}`);
      console.log(`Change Tag: ${result.big_change}`);
      console.log(`Stability: ${result.stability_6}`);
      console.log(`\nStrength/Weakness:`);
      console.log(`  Short Strength: ${result.strength_short}`);
      console.log(`  Short Weakness: ${result.weakness_short}`);
      console.log(`  Mid Strength: ${result.strength_mid}`);
      console.log(`  Mid Weakness: ${result.weakness_mid}`);
      console.log(`\nNew Metrics:`);
      console.log(`  E_delta_1_std_6: ${result.E_delta_1_std_6} (type: ${typeof result.E_delta_1_std_6})`);
      console.log(`  E_slope_6_std_6: ${result.E_slope_6_std_6} (type: ${typeof result.E_slope_6_std_6})`);

      // Diagnostic information
      console.log(`\nDiagnostic Info:`);
      console.log(`  Record count: ${userRows.length} months`);
      console.log(`  Has mid history: ${userRows.length > 2}`);
      console.log(`  All result keys: ${Object.keys(result).join(", ")}`);

      console.log(`\nKey Metrics:`);
      console.log(`  E_delta_1: ${result.E_delta_1}`);
      console.log(`  E_delta_1_prev: ${result.E_delta_1_prev}`);
      console.log(`  E_slope_6: ${result.E_slope_6}`);
      console.log(`  V_delta_1: ${result.V_delta_1}, D_delta_1: ${result.D_delta_1}, A_delta_1: ${result.A_delta_1}`);
      console.log(`  V_slope_6: ${result.V_slope_6}, D_slope_6: ${result.D_slope_6}, A_slope_6: ${result.A_slope_6}`);

      testResults.push({
        user: address,
        recordCount: userRows.length,
        result: result
      });

    } catch (error) {
      console.error(`ERROR analyzing user ${address}:`, error.toString());
      console.error("Stack:", error.stack);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("=== Test Summary ===");
  console.log(`${"=".repeat(60)}`);
  console.log(`Tested users: ${testResults.length}`);

  // Show trend distribution
  const trendBaseCount = {};
  const trendRecentCount = {};
  const trendRefinedCount = {};

  testResults.forEach(tr => {
    const r = tr.result;
    trendBaseCount[r.trend_base] = (trendBaseCount[r.trend_base] || 0) + 1;
    trendRecentCount[r.trend_recent] = (trendRecentCount[r.trend_recent] || 0) + 1;
    trendRefinedCount[r.trend_refined] = (trendRefinedCount[r.trend_refined] || 0) + 1;
  });

  console.log("\nTrend Base Distribution:");
  Object.entries(trendBaseCount).forEach(([key, val]) => {
    console.log(`  ${key}: ${val}`);
  });

  console.log("\nTrend Recent Distribution:");
  Object.entries(trendRecentCount).forEach(([key, val]) => {
    console.log(`  ${key}: ${val}`);
  });

  console.log("\nTrend Refined Distribution:");
  Object.entries(trendRefinedCount).forEach(([key, val]) => {
    console.log(`  ${key}: ${val}`);
  });

  console.log("\n=== Test Complete ===");

  return testResults;
}

/**
 * Test a specific user by email address
 */
function testSpecificUser(emailAddress) {
  console.log(`Testing specific user: ${emailAddress}`);

  const testSheet = RatingSheetforTest;

  if (!testSheet) {
    console.error("RatingSheetforTest is not defined or not accessible!");
    return;
  }

  const allData = testSheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const colMailAddress = header.indexOf("mail address");
  if (colMailAddress === -1) {
    console.error("mail address column not found!");
    return;
  }

  // Filter for specific user
  const userRows = rows.filter(row => row[colMailAddress] === emailAddress);

  if (userRows.length === 0) {
    console.error(`No data found for user: ${emailAddress}`);
    return;
  }

  console.log(`Found ${userRows.length} records for ${emailAddress}`);

  // Sort by year and month
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const sortedRows = userRows.sort((a, b) => {
    const yearDiff = a[colYear] - b[colYear];
    if (yearDiff !== 0) return yearDiff;
    return a[colMonth] - b[colMonth];
  });

  // Show history
  console.log("\nUser History:");
  sortedRows.forEach((row, idx) => {
    console.log(`  ${idx + 1}. ${row[colYear]}-${String(row[colMonth]).padStart(2, '0')}: E=${row[header.indexOf("engagement")]}, V=${row[header.indexOf("vigor")]}, D=${row[header.indexOf("dedication")]}, A=${row[header.indexOf("absorption")]}`);
  });

  // Analyze
  const dataForAnalysis = [header].concat(sortedRows);
  const result = analyzeEngagement(dataForAnalysis);

  console.log("\n--- Analysis Results (Latest) ---");
  console.log(`Level: ${result.level}`);
  console.log(`Trend Base: ${result.trend_base}`);
  console.log(`Trend Recent: ${result.trend_recent}`);
  console.log(`Trend Refined: ${result.trend_refined}`);
  console.log(`Change Tag: ${result.big_change}`);
  console.log(`Stability: ${result.stability_6}`);
  console.log(`\nStrength/Weakness:`);
  console.log(`  Short Strength: ${result.strength_short}`);
  console.log(`  Short Weakness: ${result.weakness_short}`);
  console.log(`  Mid Strength: ${result.strength_mid}`);
  console.log(`  Mid Weakness: ${result.weakness_mid}`);
  console.log(`\nNew Metrics:`);
  console.log(`  E_delta_1_std_6: ${result.E_delta_1_std_6} (type: ${typeof result.E_delta_1_std_6})`);
  console.log(`  E_slope_6_std_6: ${result.E_slope_6_std_6} (type: ${typeof result.E_slope_6_std_6})`);

  // Diagnostic information
  console.log(`\nDiagnostic Info:`);
  console.log(`  Record count: ${userRows.length} months`);
  console.log(`  Has mid history: ${userRows.length > 2}`);
  console.log(`  Field exists in result: E_delta_1_std_6=${result.hasOwnProperty('E_delta_1_std_6')}, E_slope_6_std_6=${result.hasOwnProperty('E_slope_6_std_6')}`);

  console.log(`\nKey Metrics:`);
  console.log(`  E_delta_1: ${result.E_delta_1}`);
  console.log(`  E_delta_1_prev: ${result.E_delta_1_prev}`);
  console.log(`  E_slope_6: ${result.E_slope_6}`);
  console.log(`  V_delta_1: ${result.V_delta_1}, D_delta_1: ${result.D_delta_1}, A_delta_1: ${result.A_delta_1}`);
  console.log(`  V_slope_6: ${result.V_slope_6}, D_slope_6: ${result.D_slope_6}, A_slope_6: ${result.A_slope_6}`);

  return result;
}

/**
 * Compare old vs new logic side-by-side
 * Note: This requires having both old and new versions available
 */
function compareOldVsNew(emailAddress) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Comparing Old vs New Logic for: ${emailAddress}`);
  console.log(`${"=".repeat(60)}\n`);

  // Get data
  const sheet = RatingSheetforTest;
  const allData = sheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  const colMailAddress = header.indexOf("mail address");
  const userRows = rows.filter(row => row[colMailAddress] === emailAddress);

  if (userRows.length === 0) {
    console.error(`No data found for user: ${emailAddress}`);
    return;
  }

  // Sort
  const colYear = header.indexOf("year");
  const colMonth = header.indexOf("month");
  const sortedRows = userRows.sort((a, b) => {
    const yearDiff = a[colYear] - b[colYear];
    if (yearDiff !== 0) return yearDiff;
    return a[colMonth] - b[colMonth];
  });

  const dataForAnalysis = [header].concat(sortedRows);

  // Run NEW logic
  const newResult = analyzeEngagement(dataForAnalysis);

  console.log("NEW LOGIC RESULTS:");
  console.log(`  level: ${newResult.level}`);
  console.log(`  trend_base: ${newResult.trend_base}`);
  console.log(`  trend_recent: ${newResult.trend_recent}`);
  console.log(`  trend_refined: ${newResult.trend_refined}`);
  console.log(`  big_change: ${newResult.big_change}`);
  console.log(`  stability_6: ${newResult.stability_6}`);
  console.log(`  E_delta_1: ${newResult.E_delta_1}`);
  console.log(`  E_delta_1_prev: ${newResult.E_delta_1_prev}`);
  console.log(`  E_delta_1_std_6: ${newResult.E_delta_1_std_6} (NEW)`);
  console.log(`  E_slope_6: ${newResult.E_slope_6}`);
  console.log(`  E_slope_6_std_6: ${newResult.E_slope_6_std_6} (NEW)`);
  console.log(`  strength_short: ${newResult.strength_short}`);
  console.log(`  weakness_short: ${newResult.weakness_short}`);
  console.log(`  strength_mid: ${newResult.strength_mid}`);
  console.log(`  weakness_mid: ${newResult.weakness_mid}`);

  console.log("\nNOTE: To compare with old logic, check the existing values in the sheet.");
  console.log("Look at the columns starting from column 10 (level, trend_base, etc.)");

  return newResult;
}

/**
 * Write test results to a new sheet for easy review
 */
function writeTestResultsToSheet() {
  console.log("Running tests and writing results to sheet...");

  const testResults = testNewEvaluateLogic();

  if (!testResults || testResults.length === 0) {
    console.error("No test results to write!");
    return;
  }

  const ss = RatingSSforTest;  // Use the global RatingSSforTest spreadsheet
  const outputSheetName = "Test_Results_" + new Date().toISOString().slice(0, 10);

  // Create or clear output sheet
  let outputSheet = ss.getSheetByName(outputSheetName);
  if (outputSheet) {
    outputSheet.clear();
  } else {
    outputSheet = ss.insertSheet(outputSheetName);
  }

  // Write headers
  const headers = [
    "User Email",
    "Record Count",
    "Level",
    "Trend Base",
    "Trend Recent",
    "Trend Refined",
    "Big Change",
    "Stability 6",
    "Strength Short",
    "Weakness Short",
    "Strength Mid",
    "Weakness Mid",
    "E_delta_1",
    "E_delta_1_prev",
    "E_delta_1_std_6",
    "E_slope_6",
    "E_slope_6_std_6",
    "V_delta_1",
    "D_delta_1",
    "A_delta_1",
    "V_slope_6",
    "D_slope_6",
    "A_slope_6"
  ];

  outputSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  outputSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

  // Write data
  const dataRows = testResults.map(tr => {
    const r = tr.result;
    return [
      tr.user,
      tr.recordCount,
      r.level,
      r.trend_base,
      r.trend_recent,
      r.trend_refined,
      r.big_change,
      r.stability_6,
      r.strength_short,
      r.weakness_short,
      r.strength_mid,
      r.weakness_mid,
      r.E_delta_1,
      r.E_delta_1_prev,
      r.E_delta_1_std_6,
      r.E_slope_6,
      r.E_slope_6_std_6,
      r.V_delta_1,
      r.D_delta_1,
      r.A_delta_1,
      r.V_slope_6,
      r.D_slope_6,
      r.A_slope_6
    ];
  });

  outputSheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);

  // Format numbers
  outputSheet.getRange(2, 13, dataRows.length, 11).setNumberFormat("0.00");

  console.log(`\nResults written to sheet: ${outputSheetName}`);
  console.log(`Rows written: ${dataRows.length}`);
}
