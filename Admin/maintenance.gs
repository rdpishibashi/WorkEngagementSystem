//
// Update rating2 sheet headers to match current record structure.
// Safe to run at any time — only touches the header row (row 1).
//
function updateRating2Headers() {
  ensureRating2Headers();
  console.log("rating2 headers updated: " + RATING2_HEADERS.length + " columns");
}

//
// Delete specified year-month records in all sheets in EngagementMasterSS
//
function deleteSpecifiedWavesData() {
  const year = 2026;
  const month = 2;
  _deleteMonthData(year, month);
}

//
// Check for mismatches between the rating and the individual sheets
//

// Validate the most recent month
function validateCurrentMonth(autoFix = false) {
  let { year, month } = getCurrentDayParts(new Date());

  // Get previous month since measurement is done in previous month
  if (month === 1) {
    month = 12;
    year--;
  } else {
    month--;
  }

  return validateRatingSync(year, month, autoFix);
}

// Validate (set false), or Auto-fix (set true) specific month
function validateMonth() {
  const year = 2025;
  const month = 12;
  const autoFix = true;
  validateRatingSync(year, month, autoFix);
}

// Scan recent 6-month mismatches (false: only scan, true: scan and fix)
function validateRecent() {
  const autoFix = false;
  scanRecentMonths(autoFix);
}

//
// Create a spreadsheet for the individual incorporating the recorded engagement data.
//
function makeIndividualSheet() {
  const address = "ryousuke_fukaya@ulvac.com";
  const responseDate = setResponseDate(new Date("2026-02-28"));
  const startDate = DateUtil.getMonthsOffsetDate(responseDate, -AnalysisPeriod + 1);
  _rebuildIndividualSheetInternal(address, startDate, AnalysisPeriod);
}

//
// Re-calculate the evaluations in the "Rating" and "Individual" sheets for this month 
// using the data from the "Rating" sheet.
//
function remakeAllEvaluations() {
  const startDate = new Date("2024-3-22");
  const normalizedStart = setResponseDate(startDate);

  const ratings = RatingSheet.getDataRange().getValues();
  if (ratings.length <= 1) {
    Logger.log("No rating data found.");
    return;
  }

  Members.slice(1).forEach(member => {
    const address = member[ColumnMemberAddress];
    if (!address) {
      return;
    }

    const matches = [];
    for (let i = 1; i < ratings.length; i++) {
      const row = ratings[i];
      if (row[ColumnAddress] !== address) {
        continue;
      }
      const recordDate = row[ColumnDate];
      if (recordDate instanceof Date && setResponseDate(recordDate) >= normalizedStart) {
        matches.push({ row, sheetRow: i + 1 });
      }
    }

    if (!matches.length) {
      Logger.log(`${member[ColumnMemberName]} has no valid ratings in the specified period.`);
      return;
    }

    const latest = matches[matches.length - 1];
    const latestDate = latest.row[ColumnDate];
    const periodStart = DateUtil.getMonthsOffsetDate(
      setResponseDate(latestDate),
      -AnalysisPeriod + 1
    );

    const engagementStatus = _rebuildIndividualSheetInternal(
      address,
      periodStart,
      AnalysisPeriod,
      latest.sheetRow
    );

    if (!Object.keys(engagementStatus).length) {
      Logger.log(`${member[ColumnMemberName]} can't be calculated.`);
      return;
    }

    Logger.log(
      `${member[ColumnMemberName]} : ${engagementStatus.engagement}, ${engagementStatus.vigor}, ${engagementStatus.dedication}, ${engagementStatus.absorption}`
    );
  });
}


// =============================================================================
// EngagementMasterAll Sync & Maintenance
// =============================================================================

/**
 * Sync data from EngagementMasterSS to EngagementMasterAll.
 * Appends only year-months that do not already exist in All.
 * After appending, updates organization data on All sheets.
 */
function syncToEngagementMasterAll() {
  _syncSheetToAll(RatingMasterSheet2, RatingMasterAllSheet2, "rating2");
  _syncSheetToAll(CommentMasterSheet, CommentMasterAllSheet, "comment");

  // Update current_* columns on the newly appended data
  const memberList = getMemberList();
  console.log("Updating organization data on EngagementMasterAll...");
  const columnMap = {
    address: ColumnAddress,
    name: ColumnName,
    division: ColumnCurrentDivision,
    department: ColumnCurrentDepartment,
    section: ColumnCurrentSection,
    team: ColumnCurrentTeam,
    project: ColumnCurrentProject,
    grade: ColumnGrade
  };
  updateAttributes(RatingMasterAllSheet2, memberList, columnMap);
  updateAttributes(CommentMasterAllSheet, memberList, columnMap);
  console.log("EngagementMasterAll sync completed.");
}

// Person Master Sheet

/**
 * Headers for the person_master sheet.
 */
const PERSON_MASTER_HEADERS = [
  "mail_address", "name", "division", "department", "section",
  "team", "project", "grade", "status", "is_active", "last_measured_date"
];

/**
 * Update person_master in EngagementMasterSS.
 */
function updatePersonMasterSheet() {
  _writePersonMasterSheet(RatingMasterSheet2, EngagementMasterSS);
}

/**
 * Update person_master in EngagementMasterAll.
 */
function updatePersonMasterAllSheet() {
  _writePersonMasterSheet(RatingMasterAllSheet2, EngagementMasterAllSS);
}

// =============================================================================
// Helper Functions (prefixed with _ to hide from GAS Run dropdown)
// =============================================================================

/**
 * Delete existing data for a specific year/month from ALL 4 master sheets.
 * Use this before re-running updateMaster() to avoid duplicates.
 */
function _deleteMonthData(year, month) {
  _deleteMonthFromSheet(RatingMasterSheet, year, month, "rating");
  _deleteMonthFromSheet(RatingMasterSheet2, year, month, "rating2");
  _deleteMonthFromSheet(EvaluationMasterSheet, year, month, "evaluation");
  _deleteMonthFromSheet(CommentMasterSheet, year, month, "comment");
}

function _deleteMonthFromSheet(sheet, year, month, sheetName) {
  const data = sheet.getDataRange().getValues();
  const header = data[0];

  console.log(`Checking ${sheetName} sheet for ${year}-${month}...`);

  const filteredData = data.slice(1).filter(row => {
    return !(row[ColumnYear] === year && row[ColumnMonth] === month);
  });

  const deletedCount = data.length - 1 - filteredData.length;

  if (deletedCount === 0) {
    console.log(`  No ${year}-${month} records found in ${sheetName}`);
    return;
  }

  console.log(`  Found ${deletedCount} records to delete from ${sheetName}`);

  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  if (filteredData.length > 0) {
    sheet.getRange(2, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
  }

  console.log(`  Deleted ${deletedCount} rows from ${sheetName}`);
}

/**
 * Rebuild an individual member's sheet from RatingSheet data.
 */
function _rebuildIndividualSheetInternal(address, startDate, period, ratingRowNumber = null) {
  const ratings = RatingSheet.getDataRange().getValues();
  if (ratings.length <= 1) {
    return {};
  }

  const header = ratings[0];
  const rows = ratings.slice(1).map((row, idx) => ({
    row,
    sheetRow: idx + 2,
  })).filter(item => item.row[ColumnAddress] === address);

  if (!rows.length) {
    return {};
  }

  const filteredRows = rows.filter(item => {
    const recordDate = item.row[ColumnDate];
    return recordDate instanceof Date && setResponseDate(recordDate) >= startDate;
  });

  if (!filteredRows.length) {
    return {};
  }

  const member = Members.find(m => m[ColumnMemberAddress] === address);
  const sheetName = member ? member[ColumnMemberName] : address;
  let sheet = RatingSS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = RatingSS.insertSheet(sheetName);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet
    .getRange(2, 1, filteredRows.length, filteredRows[0].row.length)
    .setValues(filteredRows.map(item => item.row));

  const latestRow = filteredRows[filteredRows.length - 1].row;
  const engagementStatus = {
    engagement: latestRow[ColumnRatingEngagement],
    vigor: latestRow[ColumnRatingVigor],
    dedication: latestRow[ColumnRatingDedication],
    absorption: latestRow[ColumnRatingAbsorption],
  };

  _updateEngagementStatus(sheet, engagementStatus, sheet.getLastRow());

  if (ratingRowNumber !== null) {
    _updateEngagementStatus(RatingSheet, engagementStatus, ratingRowNumber);
  }

  return engagementStatus;
}

/**
 * Append rows from a source sheet to a target sheet,
 * skipping year-months that already exist in the target.
 */
function _syncSheetToAll(sourceSheet, targetSheet, sheetName) {
  const sourceData = sourceSheet.getDataRange().getValues();
  const targetData = targetSheet.getDataRange().getValues();

  if (sourceData.length <= 1) {
    console.log(`${sheetName}: No source data to sync.`);
    return;
  }

  const sourceHeader = sourceData[0];
  const targetHeader = targetData[0];
  const sourceRows = sourceData.slice(1);
  const targetRows = targetData.length > 1 ? targetData.slice(1) : [];

  // Build set of existing year-month keys in target
  const existingKeys = new Set();
  targetRows.forEach(row => {
    const key = `${row[ColumnYear]}-${row[ColumnMonth]}`;
    existingKeys.add(key);
  });

  // Filter source rows to only include new year-months
  const newRows = sourceRows.filter(row => {
    const key = `${row[ColumnYear]}-${row[ColumnMonth]}`;
    return !existingKeys.has(key);
  });

  if (newRows.length === 0) {
    console.log(`${sheetName}: No new data to append.`);
    return;
  }

  // Ensure target has headers (if empty sheet)
  if (targetData.length <= 1 && targetRows.length === 0) {
    targetSheet.getRange(1, 1, 1, sourceHeader.length).setValues([sourceHeader]);
  }

  // Ensure column count matches — pad or trim new rows to target header width
  const targetWidth = targetHeader.length > 0 ? targetHeader.length : sourceHeader.length;
  const paddedRows = newRows.map(row => {
    if (row.length >= targetWidth) {
      return row.slice(0, targetWidth);
    }
    return [...row, ...Array(targetWidth - row.length).fill("")];
  });

  // Append new rows
  const startRow = targetSheet.getLastRow() + 1;
  targetSheet.getRange(startRow, 1, paddedRows.length, targetWidth).setValues(paddedRows);

  // Log summary of appended months
  const addedMonths = new Set();
  newRows.forEach(row => addedMonths.add(`${row[ColumnYear]}-${String(row[ColumnMonth]).padStart(2, '0')}`));
  console.log(`${sheetName}: Appended ${newRows.length} rows for months: ${[...addedMonths].sort().join(', ')}`);
}

/**
 * Generate/update the person_master sheet in a given spreadsheet.
 * Uses MemberSS for member data and the rating2 sheet for last_measured_date.
 *
 * @param {Sheet} rating2Sheet - The rating2 sheet to derive last_measured_date from
 * @param {Spreadsheet} targetSS - The spreadsheet to write person_master to
 */
function _writePersonMasterSheet(rating2Sheet, targetSS) {
  const memberList = getMemberList();

  // Build last_measured_date map from rating2
  const rating2Data = rating2Sheet.getDataRange().getValues();
  const lastMeasuredMap = {};
  for (let i = 1; i < rating2Data.length; i++) {
    const row = rating2Data[i];
    const address = row[ColumnAddress];
    const date = row[ColumnDate];
    if (address && date instanceof Date) {
      if (!lastMeasuredMap[address] || date > lastMeasuredMap[address]) {
        lastMeasuredMap[address] = date;
      }
    }
  }

  // Build person_master rows
  const rows = memberList.map(member => {
    let status = "active";
    if (member.leave === "leave") {
      status = "leave";
    } else if (member.leave === "absence") {
      status = "absence";
    }
    const isActive = (status !== "leave");
    const lastMeasured = lastMeasuredMap[member.address] || "";

    return [
      member.address,
      member.alternativeName || member.name,
      member.division || "",
      member.department || "",
      member.section || "",
      member.team || "",
      member.project || "",
      member.grade || "",
      status,
      isActive,
      lastMeasured
    ];
  });

  // Write to person_master sheet (create if not exists)
  let sheet = targetSS.getSheetByName("person_master");
  if (!sheet) {
    sheet = targetSS.insertSheet("person_master");
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, PERSON_MASTER_HEADERS.length).setValues([PERSON_MASTER_HEADERS]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, PERSON_MASTER_HEADERS.length).setValues(rows);
  }

  console.log(`person_master: ${rows.length} members written (${rows.filter(r => r[9]).length} active).`);
}


function _updateEngagementStatus(sheet, engagementStatus, row = null) {
  if (!engagementStatus || !sheet) {
    return;
  }

  const targetRow = row || sheet.getLastRow();
  if (!targetRow) {
    return;
  }

  const values = [
    engagementStatus.engagement ?? "",
    engagementStatus.vigor ?? "",
    engagementStatus.dedication ?? "",
    engagementStatus.absorption ?? "",
  ];

  sheet
    .getRange(targetRow, ColumnRatingEngagement + 1, 1, values.length)
    .setValues([values]);
}
