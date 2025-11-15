// 日付からnヶ月後の日付を求める（マイナスの場合はｎヶ月前）
function getMonthsOffsetDate(date, n) {
  const offsetDate = new Date(date);
  offsetDate.setDate(1);    // set the 1st day to avoid the effect of the last day of a month
  offsetDate.setMonth(offsetDate.getMonth() + n);
  return offsetDate;
//  return Utilities.formatDate(offsetDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 日付からｎ週間後、ｎ週間前の日付を求める（マイナスがｎ週間前）
function getWeeksOffsetDate(date, n) {
  const offsetDate = new Date(date);
  offsetDate.setDate(offsetDate.getDate() + n * 7);
  return offsetDate;
//  return Utilities.formatDate(offsetDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 日付からその週の月曜日の日付を求める
// 'date' が土曜日だと同週の金曜日、日曜日だと前週の金曜日
function getMondayOfWeek(date) {
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  // 日曜日=0, 月曜日=1 なので、月曜日までの差分を計算
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(monday.getDate() + daysToMonday);
  return monday;
//  return Utilities.formatDate(monday, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 日付から指定された日付後の週の金曜日の日付を求める
// 'daysAfter = 0' の場合、'date' が土曜日だと次週の金曜日、日曜日でも次週の金曜日
function getFridayAfterDays(date, daysAfter) {
  const targetDate = new Date(date);
  targetDate.setDate(targetDate.getDate() + daysAfter);
  
  // その週の金曜日を計算
  const dayOfWeek = targetDate.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7; // 5が金曜日
  targetDate.setDate(targetDate.getDate() + daysUntilFriday);
  
  return targetDate;
}

// 日付からISO週番号を求める（国際標準）
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
/*
  var weekNumber = Utilities.formatDate(date, Session.getScriptTimeZone(), 'w');
  return weekNumber;
*/
}

// ISO週番からその週の月曜日の日付を求める
function getMondayOfWeekNumber(weekNumber, year) {
  const jan4 = new Date(year, 0, 4);          // ISO週番号は1月4日を含む週が第1週
  const jan4Monday = getMondayOfWeek(jan4);   // ISO第1週の月曜日を計算
  const result = new Date(jan4Monday);
  result.setDate(result.getDate() + (weekNumber - 1) * 7);
  return result;
//  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 日付から前月末日を求める
function getPreviousMonthEndDate(date) {
  const dateObj = new Date(date);
  const previousMonthEndDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), 0);
  return previousMonthEndDate;
//  return Utilities.formatDate(previousMonthEndDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 日付からその月の初日を求める
function getMonthFirstDate(date) {
  const dateObj = new Date(date);   // not to change given object 'date'
  dateObj.setDate(1);
  return dateObj;
//  return Utilities.formatDate(firstDay, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 日付から月の最終日を求める
function getMonthEndDate(date) {
  const dateObj = new Date(date);
  return new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);
}

// 日付から月の最終稼働日を求める
function getLastBusinessDay(date) {
  // 月末日を取得
  let lastDay = getMonthEndDate(date);
  // 土日祝日休暇判定
  while (isWeekend(lastDay) || isHoliday(lastDay) || isBreak(lastDay)) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay;
}

// 日付から n 日後の稼働日を求める（マイナスの場合は n 日前）
function getBusinessDay(date, n) {
  let businessDay = new Date(date);
  
  if (n === 0) {
    return businessDay;
  }
  
  let direction = n > 0 ? 1 : -1;
  let count = 0;
  
  while (count !== Math.abs(n)) {
    businessDay.setDate(businessDay.getDate() + direction);
    if (!isWeekend(businessDay) && !isHoliday(businessDay) && !isBreak(businessDay)) {
      count++;
    }
  }
  
  return businessDay;
}

// 土日判定
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Cashe for decreasing the calling count of 'isHoliday'
const holidayCache = new Map();
const CACHE_LIMIT = 50;

// 祝日判定
function isHoliday(date) {
  // キャッシュキーとして日付文字列を使用
  const dateKey = date.toDateString();
  
  if (holidayCache.has(dateKey)) {
    return holidayCache.get(dateKey);
  }

  if (holidayCache.size >= CACHE_LIMIT) {
    holidayCache.clear();
  }

  // 日本の祝日カレンダーのIDを定義
  const holidayCalendarId = 'ja.japanese#holiday@group.v.calendar.google.com';
  // カレンダーIDを使用してカレンダーを取得
  const calendar = CalendarApp.getCalendarById(holidayCalendarId);
  // ターゲットの日付のイベント（祝日）を取得
  const events = calendar.getEventsForDay(date);
  // イベントが存在するかどうかをチェック（存在すれば祝日、存在しなければ非祝日）
  const isHolidayResult = events.length > 0;
  
  // 結果をキャッシュ
  holidayCache.set(dateKey, isHolidayResult);
  
  return isHolidayResult;
}

// キャッシュをクリアする関数（メモリ節約用）
function clearHolidayCache() {
  holidayCache.clear();
}

// 休暇判定
function isBreak(date) {
  const month = date.getMonth() + 1;   // month = 0..11
  const day = date.getDate();

  return (month === 12 && day >= 29) || (month === 1 && day <= 3);
}

// 便利ヘルパー関数
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  return getMonthsOffsetDate(date, months);
}

function addWeeks(date, weeks) {
  return getWeeksOffsetDate(date, weeks);
}