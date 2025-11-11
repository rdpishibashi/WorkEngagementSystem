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

// Sheet references
const AnswerSheet = AnswerSS.getSheetByName("フォームの回答 1");
const RatingSheet = RatingSS.getSheetByName("rating");
const CommentSheet = CommentSS.getSheetByName("comments");
const MemberSheet = MemberSS.getSheetByName("members");
const NoEntrySheet = NoEntrySS.getSheetByName("member not entered");
const RatingMasterSheet = EngagementMasterSS.getSheetByName("rating");
const RatingMasterSheet2 = EngagementMasterSS.getSheetByName("rating2");
const RatingMasterSheet3 = EngagementMasterSS.getSheetByName("rating3");
const EvaluationMasterSheet = EngagementMasterSS.getSheetByName("evaluation");
const CommentMasterSheet = EngagementMasterSS.getSheetByName("comment");
const GreetingSheet = MessageSS.getSheetByName("greeting");
const MessageSheet = MessageSS.getSheetByName("positive psychology");

// All members 
const Members = MemberSheet.getDataRange().getValues();

// Common columns
const ColumnYear = 0;
const ColumnMonth = 1;
const ColumnDay = 2;
const ColumnDate = 3;
const ColumnAddress = 4;

// Master sheet columns (rating sheet)
const ColumnMasterName = 5;
const ColumnMasterSection = 6;
const ColumnMasterCurrentSection = 7;
const ColumnMasterGroup = 8;
const ColumnMasterCurrentGroup = 9;
const ColumnMasterProject = 10;
const ColumnMasterCurrentProject = 11;
const ColumnMasterGrade = 12;
const ColumnMasterFactor = 13;
const ColumnMasterRating = 14;
const ColumnMasterSlope6 = 15;
const ColumnMasterDelta1 = 16;
const ColumnMasterStrength = 17;
const ColumnMasterWeakness = 18;
const ColumnMasterTrendRefined = 19;

// Master2 sheet columns
const ColumnMaster2Date = 2;
const ColumnMaster2Address = 3;
const ColumnMaster2Name = 4;
const ColumnMaster2Section = 5;
const ColumnMaster2Group = 6;
const ColumnMaster2Project = 7;
const ColumnMaster2Grade = 8;
const ColumnMaster2Engagement = 9;
const ColumnMaster2Vigor = 10;
const ColumnMaster2Dedication = 11;
const ColumnMaster2Absorption = 12;

// Rating sheet columns
const ColumnRatingEngagement = 5;
const ColumnRatingVigor = 6;
const ColumnRatingDedication = 7;
const ColumnRatingAbsorption = 8;
const ColumnRatingLevel = 9;
const ColumnRatingTrendBase = 10;
const ColumnRatingTrendRecent = 11;
const ColumnRatingTrendRefined = 12;
const ColumnRatingChangeTag = 13;
const ColumnRatingStability = 14;
const ColumnRatingStrengthShort = 15;
const ColumnRatingWeaknessShort = 16;
const ColumnRatingStrengthMid = 17;
const ColumnRatingWeaknessMid = 18;
const ColumnRatingV_DeltaP10 = 19;
const ColumnRatingD_DeltaP10 = 20;
const ColumnRatingA_DeltaP10 = 21;
const ColumnRatingV_DeltaP90 = 22;
const ColumnRatingD_DeltaP90 = 23;
const ColumnRatingA_DeltaP90 = 24;
const ColumnRatingV_DeltaZ = 25;
const ColumnRatingD_DeltaZ = 26;
const ColumnRatingA_DeltaZ = 27;
const ColumnRatingV_SlopeP10 = 28;
const ColumnRatingD_SlopeP10 = 29;
const ColumnRatingA_SlopeP10 = 30;
const ColumnRatingV_SlopeP90 = 31;
const ColumnRatingD_SlopeP90 = 32;
const ColumnRatingA_SlopeP90 = 33;
const ColumnRatingV_SlopeZ = 34;
const ColumnRatingD_SlopeZ = 35;
const ColumnRatingA_SlopeZ = 36;
const ColumnRatingE_Momentum3 = 37;
const ColumnRatingE_Delta1 = 38;
const ColumnRatingE_Delta1Prev = 39;
const ColumnRatingE_Mean6 = 40;
const ColumnRatingE_Std6 = 41;
const ColumnRatingE_Slope12 = 42;
const ColumnRatingE_Slope6 = 43;
const ColumnRatingE_Accel6 = 44;
const ColumnRatingV_Delta1 = 45;
const ColumnRatingD_Delta1 = 46;
const ColumnRatingA_Delta1 = 47;
const ColumnRatingV_Slope6 = 48;
const ColumnRatingD_Slope6 = 49;
const ColumnRatingA_Slope6 = 50;

// Member sheet columns
const ColumnMemberName = 1;
const ColumnMemberKana = 2;
const ColumnMemberAlternativeName = 3;
const ColumnMemberAddress = 4;
const ColumnMemberSection = 5;
const ColumnMemberGroup = 6;
const ColumnMemberProject = 7;
const ColumnMemberGrade = 8;
const ColumnMemberLeave = 9;

// Comment sheet columns
const ColumnCommentAddress = 4;
const ColumnCommentName = 5;
const ColumnCommentSection = 6;
const ColumnCommentCurrentSection = 7;
const ColumnCommentGroup = 8;
const ColumnCommentCurrentGroup = 9;
const ColumnCommentProject = 10;
const ColumnCommentCurrentProject = 11;
const ColumnCommentGrade = 12;
const ColumnCommentConcern = 13;
const ColumnCommentComment = 14;

// Answer sheet columns
const ColumnAnswerAddress = 1;

// Constants for calculations
const MaxValueEngagement = 54; 
const MaxValueFactor = 18; 
const MaxScale = 10;

const EngagementCriteriaHigh = 32.4;    // Global standard is 36.
const EngagementCriteriaLow = 10.8;     // Global standard is 27.

// Important time constants
const Deadline = 15;              // User can enter current month data until X days after
const ReportPeriod = 6;           // Period for reports/emails/comments (6 months)
const AnalysisPeriod = 12;        // Period for analysis/quantile calculations/individual sheets (12 months)
