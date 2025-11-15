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

  const address = "iryozo@rdpi.jp";
  const fullname = "イシバシ";

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
  const period = 6;
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

function test_closeDate() {
  const lastWorkingDay = DateUtil.getLastBusinessDay(new Date())
  const scriptPropertyKey = "Last Working Day";
  const properties = PropertiesService.getScriptProperties();
  // Dateオブジェクトのミリ秒数を文字列として保存（Script Properties は文字列しか保存できない）
  properties.setProperty(scriptPropertyKey, lastWorkingDay.getTime().toString());

  // ミリ秒数を取得してDateオブジェクトに復元
  const lastDay = new Date(parseInt(properties.getProperty(scriptPropertyKey)));
  Logger.log(lastDay);
  
  const lastDate = getJananeseDateString(lastDay);
  Logger.log(lastDate);

  const closeDay = DateUtil.getFridayAfterDays(lastDay, 3);    // Friday of the week of lastDate + 3
  Logger.log(closeDay);
  const closeDate = getJananeseDateString(closeDay);
  Logger.log(closeDate);
}
