/**
 * Utility function to delete existing data for a specific year/month
 * Deletes from ALL 4 master sheets: rating, rating2, evaluation, comment
 * Use this before re-running updateMaster() to avoid duplicates
 *
 * Usage:
 * 1. Run deleteMonthData(2025, 12) to delete 2025-12 data from all sheets
 * 2. Run updateMaster() to re-import with correct delta values
 */

function deleteMonthData(year, month) {
  deleteMonthFromSheet(RatingMasterSheet2, year, month, "rating2");
  deleteMonthFromSheet(RatingMasterSheet, year, month, "rating");
  deleteMonthFromSheet(EvaluationMasterSheet, year, month, "evaluation");
  deleteMonthFromSheet(CommentMasterSheet, year, month, "comment");
}

function deleteMonthFromSheet(sheet, year, month, sheetName) {
  const data = sheet.getDataRange().getValues();
  const header = data[0];

  console.log(`Checking ${sheetName} sheet for ${year}-${month}...`);

  // Filter out rows that match the target year/month
  const filteredData = data.slice(1).filter(row => {
    return !(row[ColumnYear] === year && row[ColumnMonth] === month);
  });

  const deletedCount = data.length - 1 - filteredData.length;

  if (deletedCount === 0) {
    console.log(`  No ${year}-${month} records found in ${sheetName}`);
    return;
  }

  console.log(`  Found ${deletedCount} records to delete from ${sheetName}`);

  // Clear the sheet and rewrite with filtered data (much faster than deleting rows)
  sheet.clear();

  // Write header
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  // Write filtered data (if any remains)
  if (filteredData.length > 0) {
    sheet.getRange(2, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
  }

  console.log(`  ✓ Deleted ${deletedCount} rows from ${sheetName}`);
}

/**
 * Delete and re-import data for a specific month
 * This is the recommended way to fix the delta values issue
 */
function reimportMonth(year, month) {
  console.log(`\n=== Reimporting ${year}-${month} ===`);

  // Step 1: Delete existing data
  console.log("\nStep 1: Deleting existing data...");
  deleteMonthData(year, month);

  // Step 2: Re-import fresh data
  console.log("\nStep 2: Importing fresh data...");
  const memberList = getMemberList();
  const ratingsData = getRatingsData(year, month);

  console.log(`  Found ${ratingsData.length} ratings for ${year}-${month}`);

  const masterData = {
    ratings: [],
    ratings2: [],
    evaluations: []
  };

  ratingsData.forEach(rating => {
    const member = memberList.find(m => m.address === rating.address);
    if (member) {
      createMasterDataToBeAdded(masterData, rating, member);
    }
  });

  addToMasterRatingSheets(masterData);

  // Re-import comment data
  const commentData = getCommentData(year, month);
  console.log(`  Found ${commentData.length} comments for ${year}-${month}`);

  updateCommentAttribute(year, month);
  addToMasterCommentSheet(commentData);

  console.log(`\n✓ Successfully reimported ${ratingsData.length} records for ${year}-${month}`);
  console.log(`  - ${masterData.ratings.length} records in rating sheet`);
  console.log(`  - ${masterData.ratings2.length} records in rating2 sheet`);
  console.log(`  - ${masterData.evaluations.length} records in evaluation sheet`);
  console.log(`  - ${commentData.length} records in comment sheet`);
}

/**
 * Quick function to fix the 2025-12 delta values issue
 */
function fix_2025_12_deltas() {
  reimportMonth(2025, 12);
}
