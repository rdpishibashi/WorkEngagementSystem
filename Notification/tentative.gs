function test_notify_mail() {
  // Get the template of the mail body.
  const messageTemplate = ConvertHtml.getMailTemplate("notifyStart", MessageSS);

  // Create each user's mail contents and mail it.
  const title = "ワークエンゲージメント調査 記入のお願い";
  const replacements = {
    fullname: "石橋",
    deadline: "9月30日",
    closeDate: "10月5日",
    seasonGreeting: getSeasonalGreeting(1),
    message: getMessage(9),
    formURL: FormURL
  };
  const htmlContent = ConvertHtml.createHtmlEmail(messageTemplate, replacements);

  GmailApp.sendEmail("iryozo@rdpi.jp", title, "このメールはHTML形式で表示してください。", { 
    htmlBody: htmlContent,
    from: "ishibashi@rdpi.co.jp" 
  });
}

function test_notifyStartToIndividual() {
  const lastDate = getLastBusinessDayParts(new Date());
  const lastDateString = `${lastDate.month}月${lastDate.day}日`;
  const address = "iryozo@rdpi.jp";
  const fullname = "イシバシ";

  // Preparations for setting the configuration parameters.
  const sequenceNumber = "Notify Count";
  const properties = PropertiesService.getScriptProperties();
  let currentCount = parseInt(properties.getProperty(sequenceNumber));
  console.log(`Sequence Number: ${currentCount}`);

  // Get the template of the mail body.
  const messageTemplate = ConvertHtml.getMailTemplate("notifyStart", MessageSS);

  // Create each user's mail contents and mail it.
  const title = "ワークエンゲージメント調査 記入のお願い";
  const seasonGreeting = getSeasonalGreeting(lastDate.month);
  const message = getMessage(lastDate.month);
  const replacements = {
    fullname: fullname,
    seasonGreeting: seasonGreeting,
    message: message,
    deadline: lastDateString,
    formURL: FormURL
  };
  const htmlContent = ConvertHtml.createHtmlEmail(messageTemplate, replacements);

  GmailApp.sendEmail(address, title, "このメールはHTML形式で表示してください。", { 
    htmlBody: htmlContent,
    from: "ishibashi@rdpi.co.jp" 
  });
}

function test_getSeasonalGreeting() {
  let lastDate = [];
  lastDate.month = 5;
  lastDate.day = 20;
  Logger.log(lastDate.month + ": " + getSeasonalGreeting(lastDate.month));
}

function test_getMessage() {
  const month = 8;
  Logger.log("month : " + month)
  Logger.log(getMessage(month));
}

function test_calculatedDay() {
  const dayOfDeadline = DateUtil.getLastBusinessDay(new Date());
  for (let n = -7; n <=7; n++) {
    let calculatedDay = DateUtil.getBusinessDay(dayOfDeadline, n);
    Logger.log(n + ": " + calculatedDay);
  }
}

function test_getMonthsOffsetDate() {
  const period = 12;
  const startDate = DateUtil.getMonthsOffsetDate(new Date(), -period + 1);
  Logger.log(startDate);
}

function test_getMonthFirstDate() {
  const firstDate = DateUtil.getMonthFirstDate(new Date());
  Logger.log(firstDate);
}

function test_getMondayOfWeekNumber() {
  const monday = DateUtil.getMondayOfWeekNumber(32, 2025);
  Logger.log(monday);
}

function test_notificationDate() {
  const dayOfDeadline = DateUtil.getLastBusinessDay(new Date());

  Logger.log("Deadline: " + dayOfDeadline);
  const dayOfNotification = DateUtil.getBusinessDay(dayOfDeadline, -5);
  Logger.log("Notification: " + dayOfNotification);
  const dayBeforeDeadline = DateUtil.getBusinessDay(dayOfDeadline, -1);
  Logger.log("1day before deadline: " + dayBeforeDeadline);
  const day2BeforeDeadline = DateUtil.getBusinessDay(dayOfDeadline, -2);
  Logger.log("2day before deadline: " + day2BeforeDeadline);
  const dayAfterDeadline = DateUtil.getBusinessDay(dayOfDeadline, 1);
  Logger.log("1day after deadline: " + dayAfterDeadline);
  const day2AfterDeadline = DateUtil.getBusinessDay(dayOfDeadline, 2);
  Logger.log("2day before deadline: " + day2AfterDeadline);
  const lastNotice = DateUtil.getBusinessDay(dayOfDeadline, 3);
  Logger.log("Last notice: " + lastNotice);
}

function debugDate() {
  const testDate = new Date(2026, 12, 25);
  Logger.log(testDate);
  Logger.log('  isWeekend: ' + DateUtil.isWeekend(testDate));
  Logger.log('  isHoliday: ' + DateUtil.isHoliday(testDate));
  Logger.log('  isBreak: ' + DateUtil.isBreak(testDate));
}