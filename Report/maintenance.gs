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
  const name = Members.find(member => member[AddressOnMember] === address)?.[NameOnMember] || address;
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
  const name = Members.find(member => member[AddressOnMember] === address)?.[NameOnMember] || address;
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