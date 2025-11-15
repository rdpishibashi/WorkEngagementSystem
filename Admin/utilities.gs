//
// Helper functions
//

function getCurrentDayParts(inputDate) {
  const targetDate = new Date(inputDate);
  return {
    year: targetDate.getFullYear(),
    month: targetDate.getMonth() + 1,  // month = 0..11
    day: targetDate.getDate()
  };
}

// If the user delays their response, the date should be adjusted to the previous month.
function setResponseDate(recordedDate) {
  return recordedDate.getDate() <= Deadline ? DateUtil.getPreviousMonthEndDate(recordedDate) : recordedDate;
}
