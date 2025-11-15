//
// Set up the worksheets ID.
// Need to run and write IDs at the system setup.
//
function setUpSheets() {
  const configurationFileId = "1ykXKE9jFX3hZbVUn8dQ5POdGxu4xNKD22oqj03SMRs8";   // depend on a client
  const configurationSS = SpreadsheetApp.openById(configurationFileId);
  const configrationSheet = configurationSS.getSheetByName("configuration");

  const formID = configrationSheet.getRange("C2").getValue();
  const formURL = configrationSheet.getRange("B2").getValue();
  const answerSSID = configrationSheet.getRange("C3").getValue();
  const ratingSSID = configrationSheet.getRange("C4").getValue();
  const commnetSSID = configrationSheet.getRange("C5").getValue();
  const memberSSID = configrationSheet.getRange("C6").getValue();
  const noEntrySSID = configrationSheet.getRange("C7").getValue();
  const engagementSSID = configrationSheet.getRange("C8").getValue();
  const sayingSSID = configrationSheet.getRange("C9").getValue();
  const advisceSSID = configrationSheet.getRange("C10").getValue();
  const messageSSID = configrationSheet.getRange("C11").getValue();

  console.log("FormID : " + formID);
  console.log("FormURL : " + formURL);
  console.log("AnswerSS : " + answerSSID);
  console.log("RatingSS : " + ratingSSID);
  console.log("CommentSS : " + commnetSSID);
  console.log("MemberSS : " + memberSSID);
  console.log("NoEntrySS : " + noEntrySSID);
  console.log("EngagementMasterSS : " + engagementSSID);
  console.log("SayingSS : " + sayingSSID);
  console.log("AdviceSS : " + advisceSSID);
  console.log("MessageSS : " + messageSSID);
}
