//
// Identify non-respondents and record their details in the spreadsheet.
//
function checkNoEntryMember() {
  const answers = AnswerSheet.getDataRange().getValues();

  let headerRow = Members.shift();
  let leaveIndex = headerRow.indexOf("leave");
  let availableMembers = Members.filter(function(row) {
    return row[leaveIndex] != "Y";
  });

  // Extract mail addresses of the answered persons.
  let answeredMailAddresses = new Set(answers.map(row => row[ColumnAnswerAddress]));

  Logger.log("Total number of members : " + availableMembers.length);
  Logger.log("Total number of users entered : " + (answeredMailAddresses.size - 1));  // not count title row

  // Make array by extracting rows from availableMembers that does not contain answered persons.
  let nonRespondents = availableMembers.filter(row => !answeredMailAddresses.has(row[ColumnMemberAddress]));
  if (nonRespondents.length === 0) return;

  // Record members who did not respond in the "noentry" sheet.
  let numOfRows = NoEntrySheet.getLastRow() - 1;  // first row is titile
  if (numOfRows > 0) {
    NoEntrySheet.deleteRows(2, numOfRows);  // Clear old data
  }

  const date = new Date();
  const nonRespondentsAttributes = nonRespondents.map(member => [
    date,
    member[ColumnMemberName],
    member[ColumnMemberAddress],
    member[ColumnMemberDepartment],
    member[ColumnMemberSection]
  ]);

  Logger.log("Number of no answered users : " + nonRespondents.length);
  NoEntrySheet.getRange(2, 1, nonRespondentsAttributes.length, 5).setValues(nonRespondentsAttributes);
}
