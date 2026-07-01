//
// Send the engagement report to the designated individual.
// Notice: Do not record data.
//
function sendReport() {

  const address ="hiroki_hosono@ulvac.com";
  const sendingAddress = address;  
//  const sendingAddress = "iryozo@rdpi.jp";  

  setGlobals();

//  const responseDate = setResponseDate(new Date("2024-10-28")); // set Date("2024-3-22") if you want to specify
  const responseDate = setResponseDate(new Date());

// Specify the inidividual sheet of the member and set it the global variable.
  const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
  const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;
  IndividualSheet = RatingSS.getSheetByName(name);

  const engagementStatus = makeIndividualSheet(address, name, responseDate, AnalysisPeriod);
  let articleCount = (memberIndex !== -1)? Members[memberIndex][CountOnMember] : 1;
  sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus, articleCount);
}

//
// Calculate engagement, record the results, and send the report using the "answer" sheet.
//
function recordAndSendReport() {
  setGlobals();

  const address = "masanobu_kamii@ulvac.com";
  let sendingAddress = "";
  sendingAddress = "iryozo@rdpi.jp";
//  sendingAddress = address;

  const answers = AnswerSheet.getDataRange().getValues();
  const answer = answers.filter(member => member[1] === address);
  const engagementAnswer = answer[0].slice(2);
  const engagement = calcEngagement(engagementAnswer);
  const concern = answer[11];
  const comment = answer[12];

  const responseDate = setResponseDate(new Date());

  recordEngagement(address, responseDate, engagement, concern, comment);

  // Specify the inidividual sheet of the member and set it the global variable.
  const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
  const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;
  IndividualSheet = RatingSS.getSheetByName(name);

  const engagementStatus = makeIndividualSheet(address, name, responseDate, AnalysisPeriod);

  if (TestMode) {
    console.log(`Sent a report to ${address}`);
    sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus);
  } else if (name !== address) {
    console.log(`Sending a mail to ${name}`);
    sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus);
  } else {
    console.log(`${name} is not a current member`);
  }
}

//
// Record the missing engagement data for a specific member from AnswerSS into RatingSS.
// Use when sendResponse() failed and the rating sheet was not updated.
// Uses the latest answer for the given address. Does not send a report email.
//
function recordMissingEngagement() {

  const address = "example@ulvac.com";

  setGlobals();

  const answers = AnswerSheet.getDataRange().getValues();
  const memberAnswers = answers.filter(row => row[1] === address);
  if (!memberAnswers.length) {
    Logger.log("No answers found for " + address);
    return;
  }

  const answer = memberAnswers[memberAnswers.length - 1]; // latest entry
  const responseDate = new Date(answer[0]);               // use submission timestamp to preserve month assignment
  const engagementAnswer = answer.slice(2);
  const engagement = calcEngagement(engagementAnswer);
  const concern = answer[11];
  const comment = answer[12];

  const ratingRowNumber = recordEngagement(address, responseDate, engagement, concern, comment);
  Logger.log("Recorded engagement data of " + address);

  const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
  const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;
  IndividualSheet = RatingSS.getSheetByName(name);

  makeIndividualSheet(address, name, responseDate, AnalysisPeriod, ratingRowNumber);
  Logger.log("Updated individual sheet of " + name);
}

//
// Recalculate all evaluation indexes in the "rating" sheet.
// Each user's rows are processed incrementally (earliest to latest)
// so that each row's result reflects only the data available at that point.
//
function recalculateRatingSheet() {
  setGlobals();

  const ratings = RatingSheet.getDataRange().getValues();
  const dataRows = ratings.slice(1);
  if (!dataRows.length) {
    Logger.log("No data rows found.");
    return;
  }

  const resultFields = getResultHeaders();

  // Group rows by mail address, preserving sheet order
  const userGroups = {};
  dataRows.forEach((row, idx) => {
    const mail = row[Address];
    if (!userGroups[mail]) {
      userGroups[mail] = [];
    }
    userGroups[mail].push({ row: row, index: idx });
  });

  // Prepare result matrix (one entry per data row)
  const resultMatrix = dataRows.map(() => resultFields.map(() => ""));

  // Process each user incrementally
  const mails = Object.keys(userGroups);
  for (let u = 0; u < mails.length; u++) {
    const entries = userGroups[mails[u]];

    for (let i = 0; i < entries.length; i++) {
      // Build input with all rows up to and including the current one
      const inputRows = entries.slice(0, i + 1).map(e => e.row);
      const analyzeInput = [BASE_INDIVIDUAL_HEADER].concat(inputRows);
      const result = analyzeEngagement(analyzeInput) || {};

      resultMatrix[entries[i].index] = resultFields.map(field =>
        result[field] !== undefined ? result[field] : ""
      );
    }

    Logger.log("[" + (u + 1) + "/" + mails.length + "] " + mails[u] + " (" + entries.length + " rows)");
  }

  // Bulk write all results at once
  ensureResultHeaders(RatingSheet);
  RatingSheet.getRange(2, RESULT_START_COLUMN, resultMatrix.length, resultFields.length)
    .setValues(resultMatrix);

  Logger.log("Recalculation complete: " + dataRows.length + " rows updated.");
}

//
// Remake all individual sheets in RatingSS using makeIndividualSheet().
// Intended to run after recalculateRatingSheet() so that each person's
// sheet reflects the recalculated evaluation indexes.
//
function remakeAllIndividualSheets() {
  setGlobals();

  // Pre-scan the rating sheet to collect unique addresses and
  // each user's latest row number (for the rating sheet write-back).
  const ratings = RatingSheet.getDataRange().getValues();
  const dataRows = ratings.slice(1);
  const latestRowByMail = {};
  dataRows.forEach((row, idx) => {
    latestRowByMail[row[Address]] = idx + 2; // 1-based, skip header
  });

  const responseDate = new Date();
  const addresses = Object.keys(latestRowByMail);
  let processed = 0;

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
    const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;

    IndividualSheet = RatingSS.getSheetByName(name);
    makeIndividualSheet(address, name, responseDate, AnalysisPeriod, latestRowByMail[address]);
    processed++;
    Logger.log("[" + processed + "/" + addresses.length + "] " + name);
  }

  Logger.log("Remake complete: " + processed + " individual sheets updated.");
}

//
// Recalculate evaluation indexes for rows matching a specific year/month.
// Uses all prior rows per user as context (analyzeEngagement needs full history),
// but only writes results to the target rows.
//
function recalculateMonth(targetYear, targetMonth) {
  setGlobals();

  const ratings = RatingSheet.getDataRange().getValues();
  const dataRows = ratings.slice(1);
  if (!dataRows.length) {
    Logger.log("No data rows found.");
    return;
  }

  const resultFields = getResultHeaders();

  // Group rows by mail address, preserving sheet order
  const userGroups = {};
  dataRows.forEach((row, idx) => {
    const mail = row[Address];
    if (!userGroups[mail]) {
      userGroups[mail] = [];
    }
    userGroups[mail].push({ row: row, index: idx });
  });

  // Collect row-level updates: { sheetRow, values }
  const updates = [];

  const mails = Object.keys(userGroups);
  for (let u = 0; u < mails.length; u++) {
    const entries = userGroups[mails[u]];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.row[Year] !== targetYear || entry.row[Month] !== targetMonth) {
        continue;
      }

      // Build input with all rows up to and including this one
      const inputRows = entries.slice(0, i + 1).map(e => e.row);
      const analyzeInput = [BASE_INDIVIDUAL_HEADER].concat(inputRows);
      const result = analyzeEngagement(analyzeInput) || {};

      const values = resultFields.map(field =>
        result[field] !== undefined ? result[field] : ""
      );

      updates.push({ sheetRow: entry.index + 2, values: values }); // +2: 1-based, skip header
    }

    if (updates.length > 0) {
      Logger.log("[" + (u + 1) + "/" + mails.length + "] " + mails[u]);
    }
  }

  // Write updates row by row
  ensureResultHeaders(RatingSheet);
  for (const update of updates) {
    RatingSheet.getRange(update.sheetRow, RESULT_START_COLUMN, 1, resultFields.length)
      .setValues([update.values]);
  }

  Logger.log("Recalculation complete: " + updates.length + " rows updated for " + targetYear + "-" + targetMonth + ".");
}

//
// Recalculate 2026-02 rows.
//
function recalculate202602() {
  recalculateMonth(2026, 2);
}

