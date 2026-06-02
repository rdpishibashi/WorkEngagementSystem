//
// Global variables
// Be careful to copy and paste this section from Work Engagement project of the client.
//

// Configuraion for Work Engagement Investigation that depends on a client
const FormID = "1naOGCCIm8rinqriQUulwKlvL1W3PelRGMkhA10f01gM";
const FormURL = "https://docs.google.com/forms/d/e/1FAIpQLSdjhTcRjw56ZYKd2TKpMjuujTUWno8nWvh4KWtkBWR8DyvdaA/viewform?usp=sf_link";
const ConfigurationFileId = "1ykXKE9jFX3hZbVUn8dQ5POdGxu4xNKD22oqj03SMRs8";
const ConfigurationSS = SpreadsheetApp.openById(ConfigurationFileId);
const ConfigrationSheet = ConfigurationSS.getSheetByName("configuration");

// Spreadsheet references
const AnswerSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C3").getValue());
const RatingSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C4").getValue());
const CommentSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C5").getValue());
const MemberSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C6").getValue());
const NoEntrySS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C7").getValue());
const EngagementMasterSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C8").getValue());
//const EngagementMasterSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C20").getValue());   // for test
const SayingSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C9").getValue());
const AdviceSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C10").getValue());
const MessageSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C11").getValue());
const EngagementMasterAllSS = SpreadsheetApp.openById(ConfigrationSheet.getRange("C12").getValue());

// Sheet references
const AnswerSheet = AnswerSS.getSheetByName("Form Responses 1");
const RatingSheet = RatingSS.getSheetByName("rating");
const CommentSheet = CommentSS.getSheetByName("comments");
const MemberSheet = MemberSS.getSheetByName("members");
const NoEntrySheet = NoEntrySS.getSheetByName("member not entered");
const RatingMasterSheet = EngagementMasterSS.getSheetByName("rating");
const RatingMasterSheet2 = EngagementMasterSS.getSheetByName("rating2");
const EvaluationMasterSheet = EngagementMasterSS.getSheetByName("evaluation");
const CommentMasterSheet = EngagementMasterSS.getSheetByName("comment");
const RatingMasterAllSheet2 = EngagementMasterAllSS.getSheetByName("rating2");
const CommentMasterAllSheet = EngagementMasterAllSS.getSheetByName("comment");
const GreetingSheet = MessageSS.getSheetByName("greeting");
const MessageSheet = MessageSS.getSheetByName("positive psychology");

// All members 
const Members = MemberSheet.getDataRange().getValues();

// Common columns (used across all sheets: rating, rating2, evaluation, comment)
const ColumnYear = 0;
const ColumnMonth = 1;
const ColumnDay = 2;
const ColumnDate = 3;
const ColumnAddress = 4;
const ColumnName = 5;
const ColumnDivision = 6;
const ColumnCurrentDivision = 7;
const ColumnDepartment = 8;
const ColumnCurrentDepartment = 9;
const ColumnSection = 10;
const ColumnCurrentSection = 11;
const ColumnTeam = 12;
const ColumnCurrentTeam = 13;
const ColumnProject = 14;
const ColumnCurrentProject = 15;
const ColumnGrade = 16;

// Master rating sheet columns (factor-based view)
const ColumnMasterFactor = 17;
const ColumnMasterScore = 18;

// Master2 (rating2) sheet columns - analytics fields after common columns
const ColumnMaster2Engagement = 17;
const ColumnMaster2Vigor = 18;
const ColumnMaster2Dedication = 19;
const ColumnMaster2Absorption = 20;
const ColumnMaster2Level = 21;
const ColumnMaster2TrendBase = 22;
const ColumnMaster2TrendRecent = 23;
const ColumnMaster2TrendRefined = 24;
const ColumnMaster2BigChange = 25;
const ColumnMaster2Stability6 = 26;
const ColumnMaster2InterventionPriorityNeg = 27;
const ColumnMaster2InterventionPriorityPos = 28;
const ColumnMaster2StrengthShort = 29;
const ColumnMaster2WeaknessShort = 30;
const ColumnMaster2StrengthMid = 31;
const ColumnMaster2WeaknessMid = 32;
const ColumnMaster2E_Delta1 = 33;
const ColumnMaster2E_Delta1Prev = 34;
const ColumnMaster2E_Delta1Std12 = 35;
const ColumnMaster2E_Slope6 = 36;
const ColumnMaster2E_Slope6Std12 = 37;
const ColumnMaster2V_Delta1 = 38;
const ColumnMaster2D_Delta1 = 39;
const ColumnMaster2A_Delta1 = 40;
const ColumnMaster2V_Slope6 = 41;
const ColumnMaster2D_Slope6 = 42;
const ColumnMaster2A_Slope6 = 43;
const ColumnMaster2E_Slope3m = 44;
const ColumnMaster2FlagConstant6m = 45;

// Rating sheet (RatingSS) columns
const ColumnRatingEngagement = 5;
const ColumnRatingVigor = 6;
const ColumnRatingDedication = 7;
const ColumnRatingAbsorption = 8;
const ColumnRatingLevel = 9;
const ColumnRatingTrendBase = 10;
const ColumnRatingTrendRecent = 11;
const ColumnRatingTrendRefined = 12;
const ColumnRatingBigChange = 13;
const ColumnRatingStability6 = 14;
const ColumnRatingDirection6P90 = 15;      // stability_6 の直後へ移動（was 25）
const ColumnRatingVolatility6P90 = 16;     // stability_6 の直後へ移動（was 26）
const ColumnRatingStrengthShort = 17;      // was 15
const ColumnRatingWeaknessShort = 18;      // was 16
const ColumnRatingStrengthMid = 19;        // was 17
const ColumnRatingWeaknessMid = 20;        // was 18
const ColumnRatingE_Delta1 = 21;           // was 19
const ColumnRatingE_Delta1Prev = 22;       // was 20
const ColumnRatingE_Delta1Std12 = 23;      // was 21
const ColumnRatingE_Slope6 = 24;           // was 22
const ColumnRatingE_Slope6Std12 = 25;      // was 23
const ColumnRatingE_Slope3m = 26;          // was 24
const ColumnRatingV_Delta1 = 27;           // unchanged
const ColumnRatingD_Delta1 = 28;
const ColumnRatingA_Delta1 = 29;
const ColumnRatingV_Slope6 = 30;
const ColumnRatingD_Slope6 = 31;
const ColumnRatingA_Slope6 = 32;

// Comment sheet specific columns
const ColumnCommentConcern = 17;
const ColumnCommentComment = 18;

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

// Constants for calculations
const MaxValueEngagement = 54; 
const MaxValueFactor = 18; 
const MaxScale = 10;

const EngagementCriteriaHigh = 32.4;    // Global standard is 36.
const EngagementCriteriaLow = 10.8;     // Global standard is 27.

// Important time constants
const Deadline = 10;              // User can enter current month data until X days after
const ReportPeriod = 6;           // Period for reports/emails/comments (6 months)
const AnalysisPeriod = 16;        // Period for analysis/quantile calculations/individual sheets (16 months)
