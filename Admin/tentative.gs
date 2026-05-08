function test_computeMondayOfWeek() {
  var dateString = '2024-8-30';
  var date = new Date(dateString);
  var monday = DateUtil.getMondayOfWeek(date);
  console.log(monday);
}

function test_getMondayOfWeekNumber() {
  const weekNumber = 27;
  const year = 2024;
  console.log(DateUtil.getMondayOfWeekNumber(weekNumber, year));
}

function test_getWeekNumber() {
  var date = new Date("2024-8-30");
  var weekNumber = DateUtil.getWeekNumber(date);
  console.log(weekNumber);
}

function test_getWeekOffsetDate(){
  var dateString = '2024-8-30';
  var date = new Date(dateString);
  var offset = 1;
  console.log(DateUtil.getWeeksOffsetDate(date, offset));
}

function test_getMonthsOffsetDate() {
  var dateString = '2024-8-30';
  var offset = 1;
  var date = new Date(dateString);
  console.log(DateUtil.getMonthsOffsetDate(date, offset));
}

function test_getPreviousMonthEndDate() {
  var previousMonthEndDate = DateUtil.getPreviousMonthEndDate("2024-8-30");
  console.log(previousMonthEndDate);
}

function test_getLastDayOfMonth() {
  var lastDayOfMonth = DateUtil.getLastDayOfMonth("2024-8-10");
  console.log(lastDayOfMonth);
}

function test_lastDate() {
  var date = new Date();
  date = DateUtil.getLastDayOfMonth(date);
  console.log(date);
}

function test_isBreak() {
//  var date = new Date("2023-12-30");
  var date = new Date("2024-1-2");
  if (DateUtil.isBreak(date))
    console.log("in break");
  else 
    console.log("not in break");
}

function test_getBusinessDay() {
  var date = new Date("2024-8-28");
  date = DateUtil.getBusinessDay(date, 1);
  console.log(date);
}

function test_lastBusinessDay() {
  var date = new Date("2024-8-30");
  date = DateUtil.getLastBusinessDay(date);
  console.log(date);
}

function setFormResponses() {
  var form = FormApp.openById(FormID); 
//  form.setAcceptingResponses(!form.isAcceptingResponses()); 
  form.setAcceptingResponses(true); 
}

function test_updateCommentAttribute() {
  updateCommentAttribute(2025, 2);
}

function test_updateAttributes() {
  // All master sheets now use the same common column indices
  const columnMap = {
    address: ColumnAddress,
    name: ColumnName,
    division: ColumnCurrentDivision,
    department: ColumnCurrentDepartment,
    section: ColumnCurrentSection,
    team: ColumnCurrentTeam,
    project: ColumnCurrentProject,
    grade: ColumnGrade
  };
  const memberList = getMemberList();
  updateAttributes(RatingMasterSheet2, memberList, columnMap);
}

function test_new_user_evalution() {
  testSpecificUser("yuki_tajiri@ulvac.com");
}
