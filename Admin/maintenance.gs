//
// Delete specified year-month records in all sheets in EngagementMasterSS
//
function deleteSpecifiedWavesData() {
  const year = 2025;
  const month = 12;
  deleteMonthData(year, month);
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
  const address = "kazushige_watanabe@ulvac.com";
  const responseDate = setResponseDate(new Date("2025-12-1"));
  const startDate = DateUtil.getMonthsOffsetDate(responseDate, -AnalysisPeriod + 1);
  rebuildIndividualSheetInternal(address, startDate, AnalysisPeriod);
}

//
// Re-calculate the evaluations in the "Rating" and "Individual" sheets for this month 
// using the data from the "Rating" sheet.
//
function remakeAllEvaluations() {
  const startDate = new Date("2024-3-22");
  const normalizedStart = setResponseDate(startDate);

  Members.slice(1).forEach(member => {
    const address = member[ColumnMemberAddress];
    if (!address) {
      return;
    }

    const ratings = RatingSheet.getDataRange().getValues();
    if (ratings.length <= 1) {
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

    const engagementStatus = rebuildIndividualSheetInternal(
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

//
// Update attributes in the Master sheets by using Member sheet.
//
function updateMasterSheetAttributes() {
  var memberColumns = {
    member_name: ColumnMemberAlternativeName,
    mail_address: ColumnMemberAddress,
    division: ColumnMemberDivision,
    department: ColumnMemberDepartment,
    section: ColumnMemberSection,
    team: ColumnMemberTeam,
    project: ColumnMemberProject,
    grade: ColumnMemberGrade
  };

  var masterSheets = [
    { sheet: RatingMasterSheet, columns: { name: ColumnName, mail_address: ColumnAddress, division: ColumnCurrentDivision, department: ColumnCurrentDepartment, section: ColumnCurrentSection, team: ColumnCurrentTeam, project: ColumnCurrentProject, grade: ColumnGrade } },
    { sheet: RatingMasterSheet2, columns: { name: ColumnName, mail_address: ColumnAddress, division: ColumnCurrentDivision, department: ColumnCurrentDepartment, section: ColumnCurrentSection, team: ColumnCurrentTeam, project: ColumnCurrentProject, grade: ColumnGrade } },
    { sheet: EvaluationMasterSheet, columns: { name: ColumnName, mail_address: ColumnAddress, division: ColumnCurrentDivision, department: ColumnCurrentDepartment, section: ColumnCurrentSection, team: ColumnCurrentTeam, project: ColumnCurrentProject, grade: ColumnGrade } },
    { sheet: CommentMasterSheet, columns: { name: ColumnName, mail_address: ColumnAddress, division: ColumnCurrentDivision, department: ColumnCurrentDepartment, section: ColumnCurrentSection, team: ColumnCurrentTeam, project: ColumnCurrentProject, grade: ColumnGrade } },
  ];

  var memberMap = {};
  for (var i = 1; i < Members.length; i++) { // Start from 1 to skip headers
    memberMap[Members[i][memberColumns.mail_address - 1]] = i;
  }

  masterSheets.forEach(function (masterSheetInfo) {
    var masterSheet = masterSheetInfo.sheet;
    var masterColumns = masterSheetInfo.columns;
    var masterData = masterSheet.getDataRange().getValues();

    for (var i = 1; i < masterData.length; i++) { // Start from 1 to skip headers
      var mailAddress = masterData[i][masterColumns.mail_address - 1];
      var memberRow = memberMap[mailAddress];

      if (memberRow !== undefined) {
        masterData[i][masterColumns.name - 1] = Members[memberRow][memberColumns.member_name - 1];
        masterData[i][masterColumns.division - 1] = Members[memberRow][memberColumns.division - 1];
        masterData[i][masterColumns.department - 1] = Members[memberRow][memberColumns.department - 1];
        masterData[i][masterColumns.section - 1] = Members[memberRow][memberColumns.section - 1];
        masterData[i][masterColumns.team - 1] = Members[memberRow][memberColumns.team - 1];
        masterData[i][masterColumns.project - 1] = Members[memberRow][memberColumns.project - 1];
        masterData[i][masterColumns.grade - 1] = Members[memberRow][memberColumns.grade - 1];
      }
    }

    masterSheet.getRange(1, 1, masterData.length, masterData[0].length).setValues(masterData);
  });
}


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
  deleteMonthFromSheet(RatingMasterSheet, year, month, "rating");
  deleteMonthFromSheet(RatingMasterSheet2, year, month, "rating2");
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

//
// Correct the email address and recreate the individual's sheet 
// if the user provides an incorrect email address.
//
function recoverInvalidMailAddress() {
  const invalidMailAddress ="tetsuya_kaneda＠ulvac.com";
  const validMailAddress = "tetsuya_kaneda@ulvac.com";

  // Correcct the answer sheet "Work Engagement（回答）".
  const answers = AnswerSheet.getDataRange().getValues();
  let answerRowIndex = -1;
  for (let i = 1; i <= AnswerSheet.getLastRow(); i++) {
    let address = answers[i - 1][ColumnAnswerAddress];
    if (address == invalidMailAddress) {
      let addressCell = AnswerSheet.getRange(i, ColumnAnswerAddress + 1);
      addressCell.setValue(validMailAddress);
      answerRowIndex = i;
      break;
    }
  }
  if (answerRowIndex === -1) {
    console.log("No matching answer row.");
    return;
  }
  const responseDate = answers[answerRowIndex - 1][0];

  // Correct the address in the rating sheet "engagement_rating".
  const ratings = RatingSheet.getDataRange().getValues();
  const headerRow = ratings.shift();
  const mailAddressIndex = headerRow.indexOf("mail address"); 

  const filteredRatings = ratings.map(function(row, index) {
    return {
      rowIndex: index + 1, // +1 to account for header row
      row: row
    };
  }).filter(function(item) {
    return item.row[mailAddressIndex] === invalidMailAddress;
  });

  if (filteredRatings.length !== 1) {
    console.log("Invalid number of data");
    return;
  }

  const ratingIndex = filteredRatings[0].rowIndex;
  const ratingRowNumber = ratingIndex + 1;
  const addressCellinRating = RatingSheet.getRange(ratingRowNumber, mailAddressIndex + 1);
  addressCellinRating.setValue(validMailAddress);

  // Make the individual's sheet.
  const periodStart = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -AnalysisPeriod + 1);
  rebuildIndividualSheetInternal(validMailAddress, periodStart, AnalysisPeriod, ratingRowNumber);
  console.log(validMailAddress + " has changed in row number: " + ratingRowNumber);

  // Delete invalid individual sheet.
  const invalidSheet = RatingSS.getSheetByName(invalidMailAddress);
  RatingSS.deleteSheet(invalidSheet);

  // Update the address in "engagement_comment" when a comment is submitted.
  const comments = CommentSheet.getDataRange().getValues();
  const commentHeader = comments.shift(); // Get the header row
  const commentMailIndex = commentHeader.indexOf("mail_address"); 

  const filteredComments = comments.map(function(row, index) {
    return {
      rowIndex: index + 1, // +1 to account for header
      row: row
    };
  }).filter(function(item) {
    return commentMailIndex !== -1 && item.row[commentMailIndex] === invalidMailAddress;
  });

  if (filteredComments.length === 0) {
    console.log("No Comment found for the mail address.");
    return;
  }
  const commentIndex = filteredComments[0].rowIndex;
  const addressCellinComment = CommentSheet.getRange(commentIndex + 1, commentMailIndex + 1);
  addressCellinComment.setValue(validMailAddress);
  console.log("Mail address has changed in row number: " + commentIndex + 1);
}

function rebuildIndividualSheetInternal(address, startDate, period, ratingRowNumber = null) {
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

  updateEngagementStatus(sheet, engagementStatus, sheet.getLastRow());

  if (ratingRowNumber !== null) {
    updateEngagementStatus(RatingSheet, engagementStatus, ratingRowNumber);
  }

  return engagementStatus;
}

function updateEngagementStatus(sheet, engagementStatus, row = null) {
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
