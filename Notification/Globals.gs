//
// Global variables
// Be careful to copy and paste this section from Work Engagement project of the client.
//

const TestMode = getOperationMode() === 'test' ? true : false;
const Deadline = 10;           // User can enter current month data until X days after

// Configuraion for Work Engagement Investigation that depends on a client
const FormURL = "https://docs.google.com/forms/d/e/1FAIpQLSdjhTcRjw56ZYKd2TKpMjuujTUWno8nWvh4KWtkBWR8DyvdaA/viewform?usp=sf_link";
const FormID = "1naOGCCIm8rinqriQUulwKlvL1W3PelRGMkhA10f01gM";
const ConfigurationFileId = "1ykXKE9jFX3hZbVUn8dQ5POdGxu4xNKD22oqj03SMRs8";
const ConfigurationSS = SpreadsheetApp.openById(ConfigurationFileId);
const ConfigrationSheet = ConfigurationSS.getSheetByName("configuration");

// Spreadsheet references
const MemberSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C6").getValue());
const MessageSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C11").getValue());
const AnswerSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C3").getValue());
const NoEntrySS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C7").getValue());

// Sheet references
const MemberSheet = MemberSS.getSheetByName("members");
const GreetingSheet = MessageSS.getSheetByName("greeting");
const MessageSheet = MessageSS.getSheetByName("message");
const ColumnSheet = MessageSS.getSheetByName("wellbeing");
const AnswerSheet = AnswerSS.getSheetByName("Form Responses 1");
const NoEntrySheet = NoEntrySS.getSheetByName("member not entered");

// All members 
const Members = MemberSheet.getDataRange().getValues();

// Member sheet columns
const ColumnMemberName = 1;
const ColumnMemberKana = 2;
const ColumnMemberAlternativeName = 3;
const ColumnMemberAddress = 4;
const ColumnMemberDivision = 5;
const ColumnMemberDepartment = 6;
const ColumnMemberSection = 7;
const ColumnMemberTeam = 8;
const ColumnMemberProject = 9;
const ColumnMemberGrade = 10;
const ColumnMemberLeave = 11;

// Answer sheet columns
const ColumnAnswerAddress = 1;

// For mail
const MailFrom = "ishibashi@rdpi.co.jp";
const TestMailTo = "iryozo@rdpi.jp";
const TestMailInterval = 35;

// Script Properties Keys
const LastWorkingDayKey = "Last Working Day";