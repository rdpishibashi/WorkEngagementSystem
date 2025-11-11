//
// If the user delays their response, the date should be adjusted to the previous month.
//
function setResponseDate(recordedDate) {
  return recordedDate.getDate() <= Deadline ? DateUtil.getPreviousMonthEndDate(recordedDate) : recordedDate;
}

// Function to switch to test mode
function switchToTestMode() {
  PropertiesService.getScriptProperties().setProperty('Operation Mode', 'test');
}

// Function to switch to operation mode
function switchToOperationMode() {
  PropertiesService.getScriptProperties().setProperty('Operation Mode', 'operation');
}
