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

//
// 使用例
// console.log(getJananeseDateString('2024-09-30')); // ９月３０日（月）
// console.log(getJananeseDateString('2024-09-30', true)); // ２０２４年９月３０日（月）
//
function getJananeseDateString(inputDate, includeYear = false) {
  const targetDate = new Date(inputDate);
  
  const 曜日 = ['日', '月', '火', '水', '木', '金', '土'];
  
  const toZenkaku = (num) => {
    const zenkakuNums = '０１２３４５６７８９';
    return String(num).split('').map(n => zenkakuNums[n]).join('');
  };
  
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();
  const dayOfWeek = targetDate.getDay();
  
  if (includeYear) {
    return `${toZenkaku(year)}年${toZenkaku(month)}月${toZenkaku(day)}日（${曜日[dayOfWeek]}）`;
  } else {
    return `${toZenkaku(month)}月${toZenkaku(day)}日（${曜日[dayOfWeek]}）`;
  }
}

function getLastBusinessDayParts(date) {
  let lastDay = DateUtil.getLastBusinessDay(date);
  let month = lastDay.getMonth() + 1;   // month = 0..11
  let day = lastDay.getDate();

  if (month == 12)
    day = 27;

  return { 
    month: month,
    day: day
  };
}

// If the user delays their response, the date should be adjusted to the previous month.
function setResponseDate(recordedDate) {
  return recordedDate.getDate() <= Deadline ? DateUtil.getPreviousMonthEndDate(recordedDate) : recordedDate;
}
