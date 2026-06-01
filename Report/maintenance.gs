//
// Send the engagement report to the designated individual.
// Notice: Do not record data.
//
function sendReport() {

  const address ="masanobu_kamii@ulvac.com";
//  const sendingAddress = address;  
  const sendingAddress = "iryozo@rdpi.jp";  

  setGlobals();

//  const responseDate = setResponseDate(new Date("2024-10-28")); // set Date("2024-3-22") if you want to specify
  const responseDate = setResponseDate(new Date());

  // Specify the inidividual sheet of the member and set it the global variable.
  const name = resolveMemberName(address);
  IndividualSheet = RatingSS.getSheetByName(name);

  const engagementStatus = makeIndividualSheet(address, name, responseDate, AnalysisPeriod);
  sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus);
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
  const name = resolveMemberName(address);
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
    const name = resolveMemberName(address);

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

//
// メールアドレスから member_name を解決する。
// 現役 members で見つからない退職者は members_history を参照し、それでも無ければ
// address（メールアドレス）にフォールバックする。これにより、個人シート再生成時に
// 退職者のシート名がメールアドレスになる問題を防ぐ。
// 注: members（member_name=NameOnMember, mail_address=AddressOnMember）と
//     members_history は列レイアウトが異なるため、history はヘッダー名で列を解決する。
var MemberNameByAddress = null;

function resolveMemberName(address) {
  if (!MemberNameByAddress) {
    MemberNameByAddress = {};

    // 1) members_history（退職者含む）を先に投入（現役で上書きして現役名を優先）
    try {
      const histSheet = MemberSS.getSheetByName(SHEET_NAMES.MEMBER_HISTORY);
      if (histSheet) {
        const hist = histSheet.getDataRange().getValues();
        if (hist.length > 1) {
          const header = hist[0].map(h => String(h).trim());
          const nameIdx = header.indexOf("member_name");
          const mailIdx = header.indexOf("mail_address");
          if (nameIdx >= 0 && mailIdx >= 0) {
            for (let i = 1; i < hist.length; i++) {
              const mail = hist[i][mailIdx];
              const nm = hist[i][nameIdx];
              if (mail && nm) MemberNameByAddress[String(mail).trim()] = nm;
            }
          }
        }
      }
    } catch (e) {
      Logger.log("resolveMemberName: members_history の読込をスキップ: " + e);
    }

    // 2) 現役 members で上書き
    if (Array.isArray(Members)) {
      for (let i = 1; i < Members.length; i++) {
        const mail = Members[i][AddressOnMember];
        const nm = Members[i][NameOnMember];
        if (mail && nm) MemberNameByAddress[String(mail).trim()] = nm;
      }
    }
  }
  return MemberNameByAddress[String(address).trim()] || address;
}
