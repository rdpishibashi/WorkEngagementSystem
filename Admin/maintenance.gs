//
// Correct the email address and recreate the individual's sheet 
// if the user provides an incorrect email address.
//
function recoverInvalidMailAddress() {
  const invalidMailAddress ="tetsuya_kaneda＠ulvac.com";
  const validMailAddress = "tetsuya_kaneda@ulvac.com";

  // Correcct the answer sheet "Work Engagement（回答）".
  const answers = AnswerSheet.getDataRange().getValues();
  for (let i = 1; i <= AnswerSheet.getLastRow(); i++) {
    let address = answers[i - 1][1];
    if (address == invalidMailAddress) {
      let addressCell = AnswerSheet.getRange(i, 2);
      addressCell.setValue(validMailAddress);
      break;
    }
  }
  const responseDate = answers[i - 1][0];

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
  const addressCellinRating = RatingSheet.getRange(ratingIndex + 1, mailAddressIndex + 1);
  addressCellinRating.setValue(validMailAddress);

  // Make the individual's sheet.
  const name = makeIndividualData(validMailAddress, responseDate, AnalysisPeriod);
  const engagementStatus = makeIndividualSheet(name);
  RatingSheet.getRange(ratingIndex + 1, 10).setValue(engagementStatus.engagement);
  RatingSheet.getRange(ratingIndex + 1, 11).setValue(engagementStatus.vigor);
  RatingSheet.getRange(ratingIndex + 1, 12).setValue(engagementStatus.dedication);
  RatingSheet.getRange(ratingIndex + 1, 13).setValue(engagementStatus.absorption);
  console.log(name + " has changed in row number: " + ratingIndex + 1);

  // Delete invalid individual sheet.
  const invalidSheet = RatingSS.getSheetByName(invalidMailAddress);
  RatingSS.deleteSheet(invalidSheet);

  // Update the address in "engagement_comment" when a comment is submitted.
  const comments = CommentSheet.getDataRange().getValues();
  headerRow = comments.shift(); // Get the header row
  mailAddressIndex = headerRow.indexOf("mail address"); 

  const filteredComments = comments.map(function(row, index) {
    return {
      rowIndex: index + 1, // +1 to account for header
      row: row
    };
  }).filter(function(item) {
    return item.row[mailAddressIndex] === invalidMailAddress;
  });

  if (filteredComments.length === 0) {
    console.log("No Comment found for the mail address.");
    return;
  }
  const commentIndex = filteredComments[0].rowIndex;
  const addressCellinComment = CommentSheet.getRange(commentIndex + 1, mailAddressIndex + 1);
  addressCellinComment.setValue(validMailAddress);
  console.log("Mail address has changed in row number: " + commentIndex + 1);
}

//
// Create a spreadsheet for the individual incorporating the recorded engagement data.
//
function makeIndividualSheet() {
  const address = "kouta_suzuki@ulvac.com";
  const responseDate = setResponseDate(new Date("2024-10-1")); // set the first day of the last month
  const period = AnalysisPeriod;  // Use AnalysisPeriod for individual sheet (12 months)
  const ratings = RatingSheet.getDataRange().getValues();
  const userRatings = ratings.filter(rating => rating[ColumnAddress] === address);

  const name = Members.find(member => member[ColumnMemberAddress] === address)?.[ColumnMemberName] || address;

  IndividualSheet = RatingSS.getSheetByName(name);

  if (!IndividualSheet) {
    IndividualSheet = RatingSS.insertSheet(address);
    IndividualSheet.getRange(1, 1, 1, 13).setValues([[
      "year", "month", "day", "date", "mail address", "engagement", 
      "vigor", "dedication", "absorption", "engagement evaluation", 
      "vigor evaluation", "dedication evaluation", "absorption evaluation"
    ]]);
  } else {
    const lastRow = IndividualSheet.getLastRow();
    if (lastRow !== 1)
      IndividualSheet.deleteRows(2, IndividualSheet.getLastRow() - 1); // delete all old data except for the title row
  }

  const startDate = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -period + 1);
  const individualData = userRatings.filter(rating => setResponseDate(rating[ColumnDate]) >= startDate);

  if (individualData.length) {
    IndividualSheet.getRange(2, 1, individualData.length, individualData[0].length).setValues(individualData);
  }
}

//
// Re-calculate the evaluations in the "Rating" and "Individual" sheets for this month 
// using the data from the "Rating" sheet.
//
function remakeAllEvaluations() {
  const startDate = new Date("2024-3-22");
  const ratings = RatingSheet.getDataRange().getValues();

  Members.slice(1).forEach(member => {
    const name = member[ColumnMemberName];
    const address = member[ColumnMemberAddress];
    const rowOfRating = ratings.slice(1).findIndex(row => {
      const recordDate = setResponseDate(row[ColumnDate]);
      return recordDate >= startDate && address === row[ColumnAddress];
    }) + 1;

    if (rowOfRating === 0) {
      Logger.log(`${name} has no valid ratings in the specified period.`);
      return;
    }

    const individualData = IndividualSheet.getDataRange().getValues();
    if (individualData.length <= 3) {
      Logger.log(`${name} can't be calculated.`);
      return;
    }

    const engagementStatus = {
      engagement: analyzeEngagement(individualData, "engagement"),
      vigor: analyzeEngagement(individualData, "vigor"),
      dedication: analyzeEngagement(individualData, "dedication"),
      absorption: analyzeEngagement(individualData, "absorption")
    };

    updateEngagementStatus(IndividualSheet, engagementStatus);
    updateEngagementStatus(RatingSheet, engagementStatus, rowOfRating);

    Logger.log(`${name} : ${engagementStatus.engagement}, ${engagementStatus.vigor}, ${engagementStatus.dedication}, ${engagementStatus.absorption}`);
  });
}

function updateEngagementStatus(sheet, engagementStatus, row = null) {
  const range = row ? sheet.getRange(row, 10, 1, 4) : sheet.getRange(sheet.getLastRow(), 10, 1, 4);
  range.setValues([[engagementStatus.engagement, engagementStatus.vigor, engagementStatus.dedication, engagementStatus.absorption]]);
}

//
// Update attributes in the Master sheets by using Member sheet.
//
function updateMasterSheetAttributes() {
  // Define the columns in Member and Master sheets that should be synced
  var memberColumns = {
    member_name: 2,
    mail_address: 5,
    division: 6,
    department: 7,
    section: 8,
    team: 9,
    project: 10,
    grade: 11
  };

  var masterSheets = [
    { sheet: RatingMasterSheet, columns: { name: 6, mail_address: 5, division: 8, department: 10, section: 12, team: 14, project: 16, grade: 17 } },
    { sheet: RatingMasterSheet2, columns: { name: 5, mail_address: 4, division: 6, department: 7, section: 8, team: 9, project: 10, grade: 11 } },
    { sheet: RatingMasterSheet3, columns: { name: 5, mail_address: 4, division: 6, department: 7, section: 8, team: 9, project: 10, grade: 11 } },
    { sheet: EvaluationMasterSheet, columns: { name: 6, mail_address: 5, division: 8, department: 10, section: 12, team: 14, project: 16, grade: 17 } }
  ];

  // Create a map for quick lookup of member rows by mail_address
  var memberMap = {};
  for (var i = 1; i < Members.length; i++) { // Start from 1 to skip headers
    memberMap[Members[i][memberColumns.mail_address - 1]] = i;
  }

  masterSheets.forEach(function (masterSheetInfo) {
    var masterSheet = masterSheetInfo.sheet;
    var masterColumns = masterSheetInfo.columns;

    // Get all data from the current Master sheet
    var masterData = masterSheet.getDataRange().getValues();

    // Update Master sheet based on Member sheet
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

    // Write updated data back to Master sheet
    masterSheet.getRange(1, 1, masterData.length, masterData[0].length).setValues(masterData);
  });
}
