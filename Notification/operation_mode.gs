// Function to switch to test mode
function switchToTestMode() {
  PropertiesService.getScriptProperties().setProperty('Operation Mode', 'test');
  var form = FormApp.openById(FormID); 
  form.setAcceptingResponses(false); 
}

// Function to switch to operation mode
function switchToOperationMode() {
  PropertiesService.getScriptProperties().setProperty('Operation Mode', 'operation');
  var form = FormApp.openById(FormID);  
  form.setAcceptingResponses(true); 
}

//
// Get current operation mode.
//
function getOperationMode() {
  return mode = PropertiesService.getScriptProperties().getProperty('Operation Mode');
}
