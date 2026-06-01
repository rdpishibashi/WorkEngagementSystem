const FORM_ID = "1naOGCCIm8rinqriQUulwKlvL1W3PelRGMkhA10f01gM";

const SPREADSHEET_IDS = {
  ANSWER: "1y8Zz47Ed7gw7D9scftJ5CZWMlDLeC2gsPod89vXBFsM",
  RATING: "1zM6LX_hMd1tG-ZGvs_Kum1d0nLu8zlbu7wjm3KXz8ns",
  COMMENT: "1QVI3C7aSV8mXElTPkJkl_tIjWt8n1SzEJp2nk_bF42M",
  MEMBER: "12ks0S0VXO5Q2vtBWVvwj5Lyjpr3yAAHBfDey3D9j0_8",
  SAYING: "1RJe5Hdb1U-4EG8qKmHd8IXCtbgfHMiYvujlhLCDc2Dw",
  ADVICE: "1YlI5gBuRDASfTs8vgYK52Pu_zn-pZEK1siQISbhJk80",
  MESSAGE: "1R0rJY4CZdUew3caFtd00jnxPmPtxvWFTifAdKfpNUKw",
};

const SHEET_NAMES = {
  ANSWER: "Form Responses 1",
  RATING: "rating",
  COMMENT: "comments",
  MEMBER: "members",
  MEMBER_HISTORY: "members_history",
  COLUMN: "column",
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60000;

var AnswerSS, RatingSS, CommentSS, MemberSS, SayingSS, AdviceSS, MessageSS;
var AnswerSheet, RatingSheet, CommentSheet, MemberSheet, ColumnSheet;

function ensureSpreadsheets() {
  if (
    AnswerSS &&
    RatingSS &&
    CommentSS &&
    MemberSS &&
    SayingSS &&
    AdviceSS &&
    MessageSS &&
    AnswerSheet &&
    RatingSheet &&
    CommentSheet &&
    MemberSheet &&
    ColumnSheet
  ) {
    return;
  }

  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    try {
      AnswerSS = SpreadsheetApp.openById(SPREADSHEET_IDS.ANSWER);
      RatingSS = SpreadsheetApp.openById(SPREADSHEET_IDS.RATING);
      CommentSS = SpreadsheetApp.openById(SPREADSHEET_IDS.COMMENT);
      MemberSS = SpreadsheetApp.openById(SPREADSHEET_IDS.MEMBER);
      SayingSS = SpreadsheetApp.openById(SPREADSHEET_IDS.SAYING);
      AdviceSS = SpreadsheetApp.openById(SPREADSHEET_IDS.ADVICE);
      MessageSS = SpreadsheetApp.openById(SPREADSHEET_IDS.MESSAGE);

      AnswerSheet = AnswerSS.getSheetByName(SHEET_NAMES.ANSWER);
      RatingSheet = RatingSS.getSheetByName(SHEET_NAMES.RATING);
      CommentSheet = CommentSS.getSheetByName(SHEET_NAMES.COMMENT);
      MemberSheet = MemberSS.getSheetByName(SHEET_NAMES.MEMBER);
      ColumnSheet = MessageSS.getSheetByName(SHEET_NAMES.COLUMN);

      Members = MemberSheet.getDataRange().getValues();
      return;
    } catch (error) {
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        Logger.log("Max retry count reached. Exiting.");
        throw new Error("Failed to get spreadsheets after multiple retries: " + error.message);
      }
      Logger.log(
        "Error occurred while getting a spreadsheet, retrying after delay... (" +
          retryCount +
          "/" +
          MAX_RETRIES +
          ")"
      );
      Utilities.sleep(RETRY_DELAY_MS);
    }
  }
}

function setGlobals() {
  ensureSpreadsheets();

  FormID = FORM_ID;

	Deadline = 10;              // User can enter current month data until X days after
	ReportPeriod = 6;           // Period for reports/emails/comments (6 months)
	AnalysisPeriod = 18;        // Period for analysis/quantile calculations/individual sheets (18 months)

	Year = 0;
	Month = 1;
	Day = 2;
	DateLabel = 3;
	Address = 4;

	Engagement = 5;
	Vigor = 6;
	Dedication = 7;
	Absorption = 8;

	NameOnMember = 1;
	AddressOnMember = 4;
	DivisionOnMember = 5;
	DepartmentOnMember = 6;
	SectionOnMember = 7;
	TeamOnMember = 8;
	ProjectOnMember = 9;
	GradeOnMember = 10;
	LeaveOnMember = 11;
	CountOnMember = 12;
	
    ColumnCommentConcern = 17;
    ColumnCommentComment = 18;

	MaxValueEngagement = 54; 
	MaxValueEngagementFactor = 18; 
	MaxScale = 10;

	HighCriteria = 32.4;    // Global standard is 36.
	LowCriteria = 10.8;     // Global stadard is 27.
}
