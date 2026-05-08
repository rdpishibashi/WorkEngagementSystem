//
// Creates time-based triggers for the current month's notification schedule.
// It first deletes any existing triggers managed by this function to prevent duplicates.
//
function createMonthTrigger() {
  // Set entry deadline to script properties
  const dayOfDeadline = DateUtil.getLastBusinessDay(new Date());
  // Dateオブジェクトを文字列として保存（Script Properties は文字列しか保存できない）
  const properties = PropertiesService.getScriptProperties();
  const year = dayOfDeadline.getFullYear();
  const month = dayOfDeadline.getMonth() + 1;   // getMonth() returns 0..11
  const day = dayOfDeadline.getDate();
  const dateString = `${year}-${month}-${day}`;
  properties.setProperty(LastWorkingDayKey, dateString);

  // Calculate key dates based on the last business day of the month.
//  const dayOfNotification = DateUtil.addDays(dayOfDeadline, -7);
  const dayOfNotification = DateUtil.getBusinessDay(dayOfDeadline, -5);
  const dayBeforeDeadline = DateUtil.getBusinessDay(dayOfDeadline, -1);
  const day2BeforeDeadline = DateUtil.getBusinessDay(dayOfDeadline, -2);
  const dayAfterDeadline = DateUtil.getBusinessDay(dayOfDeadline, 1);
  const day2AfterDeadline = DateUtil.getBusinessDay(dayOfDeadline, 2);
  const lastNotice = DateUtil.getBusinessDay(dayOfDeadline, 3);

  // Define all triggers in an array for easier management.
  const triggersToCreate = [
    { funcName: "notifyStart", date: dayOfNotification },
    { funcName: "dayOfDeadline", date: dayOfDeadline },
    { funcName: "dayBeforeDeadline", date: dayBeforeDeadline },
    { funcName: "day2BeforeDeadline", date: day2BeforeDeadline },
    { funcName: "dayAfterDeadline", date: dayAfterDeadline },
    { funcName: "day2AfterDeadline", date: day2AfterDeadline },
    { funcName: "lastNotice", date: lastNotice },
  ];

  if (TestMode) {
    console.log("--- Trigger Schedule (Test Mode) ---");
    triggersToCreate.forEach(t => console.log(`${t.funcName} will be set for: ${t.date}`));
    return;
  }

  // Delete existing triggers managed by this script.
  const handlerFunctions = triggersToCreate.map(t => t.funcName);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getEventType() === ScriptApp.EventType.CLOCK && handlerFunctions.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      console.log(`Deleted trigger for: ${trigger.getHandlerFunction()}`);
    }
  });

  // Helper function to create a time-based trigger for a specific function.
  const createTrigger = (handlerFunction, date) => {
    date.setHours(9);
    ScriptApp.newTrigger(handlerFunction).timeBased().at(date).create();
    console.log(`Created trigger for ${handlerFunction} at ${date}`);
  };

  // Create all new triggers based on the defined array.
  triggersToCreate.forEach(t => createTrigger(t.funcName, t.date));
}

// Wrapper functions for triggers
function dayBeforeDeadline() { notifyNoResponseMember("dayBefore"); }
function day2BeforeDeadline() { notifyNoResponseMember("dayBefore"); }
function dayOfDeadline() { notifyNoResponseMember("deadline"); }
function dayAfterDeadline() { notifyNoResponseMember("pastDeadline"); }
function day2AfterDeadline() { notifyNoResponseMember("pastDeadline"); }
function lastNotice() { notifyNoResponseMember("closeDate"); }

//
// Sends the initial survey announcement email to all active members.
//
function notifyStart() {

  // Clear the previous survey answers in production mode.
  if (AnswerSheet.getLastRow() > 1) {
    AnswerSheet.deleteRows(2, AnswerSheet.getLastRow() - 1);
    console.log("Cleared previous answers from AnswerSheet.");
  }

  // Prepare and send the emails.
  const mailTemplate = "notifyStart"
  const mailSubject = "ワークエンゲージメント調査";
  const mailData = prepareMailData(mailTemplate, mailSubject);

  sendBulkMail(mailData);
}

//
// Prepares the data object required for sending emails.
//
function prepareMailData(templateName, mailSubject) {
  const lastDate = getLastBusinessDayParts(new Date());

  return {
    template: ConvertHtml.getMailTemplate(templateName, MessageSS),
    title: mailSubject,
    mailPlainBody: "このメールはHTML形式で表示してください。",
    replacements: {
      seasonGreeting: getSeasonalGreeting(lastDate.month),
      message: getMessage(lastDate.month),
      deadline: `${lastDate.month}月${lastDate.day}日`,
      formURL: FormURL
    }
  }
}

//
// Loops through all members and sends an email using the provided mailData.
//
function sendBulkMail(mailData) {
  Members.slice(1).forEach((member, i) => {
    // Send only to active members (who have not left the company).
    const isActiveMember = !member[ColumnMemberLeave];
    if (isActiveMember) {
      sendNotification(member, i, mailData);
    }
  });
  console.log(`Bulk mail process completed for template with title: "${mailData.title}"`);
}

//
// Sends a single email to a member.
//
function sendNotification(member, index, mailData) {
  const memberName = member[ColumnMemberName];
  const memberEmail = member[ColumnMemberAddress];
  
  // Set each member's attributes
  const replacements = {
    ...mailData.replacements, // copy common data
    fullname: memberName,
  };
  
  const mailOptions = { 
    htmlBody: ConvertHtml.createHtmlEmail(mailData.template, replacements),
    from: MailFrom
  };

  try {
    if (TestMode) {
      console.log(`[Test] Would send the mail to ${member[ColumnMemberName]}`);
      if (index % TestMailInterval === 0) {
        GmailApp.sendEmail(TestMailTo, mailData.title, mailData.mailPlainBody, mailOptions);
        console.log(`[Test] Would sent to ${memberName} (${memberEmail})`);
      }
    } else {
      GmailApp.sendEmail(memberEmail, mailData.title, mailData.mailPlainBody, mailOptions);
      console.log(`Sent the mail to ${memberName} (${memberEmail})`);
    }
  } catch (e) {
    // Continue sending mails and log errors if errors happen.
    console.error(`Failed to send the mail to ${memberName} (${memberEmail}): ${e.message}`);
  }
}

//
// Sends reminder emails to members who have not yet responded to the survey.
//
function notifyNoResponseMember(timing) {
  // Check for non-respondents. If none, exit.
  if (checkNoEntryMember() === 0) {
    console.log("All members have responded. No reminders sent.");
    return;
  }

  // Script Properties から入力期限日を取得して Date オブジェクトに復元
  const properties = PropertiesService.getScriptProperties();
  const dateString = properties.getProperty(LastWorkingDayKey);
  const [year, month, day] = dateString.split('-').map(Number);   // convert string to number array
  const lastDay = new Date(year, month - 1, day);   // getMonth() returns 0..11

  const lastDateString = getJananeseDateString(lastDay);
//  const closeDay = DateUtil.getFridayAfterDays(lastDay, 3); // 入力期限日の＋３日以降の金曜日
  const closeDay = DateUtil.getBusinessDay(lastDay, 3);     // 期限の３日後（最終連絡日）
  const closeDateString = getJananeseDateString(closeDay);
//  const closeDateString = "９月５日（金）";

  // 未入力者リストの作成
  const noResponseMembers = NoEntrySheet.getDataRange().getValues();

  // お知らせの種類に合わせたメールテンプレートの取得
  const messageTemplate = ConvertHtml.getMailTemplate(timing, MessageSS);
  if (!messageTemplate) {
    Logger.log("Invalid option.");
    return;
  }

  // お知らせメールの作成と送信
  const title = "ワークエンゲージメント調査 記入のお願い";
  const mailPlainBody = "このメールはHTML形式で表示してください。";

  noResponseMembers.slice(1).forEach((member, i) => { // slice(1) to skip header row
    const [fullname, address] = [member[1], member[2]];

    // Use try-catch for robustness and fix HTML mail sending.
    try {
      const replacements = {
        fullname: fullname,
        deadline: lastDateString,
        closeDate: closeDateString,
        formURL: FormURL
      };

      const mailOptions = {
        htmlBody: ConvertHtml.createHtmlEmail(messageTemplate, replacements),
        from: MailFrom
      };

      if (TestMode) {
        if (i % TestMailInterval === 0) {
          GmailApp.sendEmail(TestMailTo, title, mailPlainBody, mailOptions);
        }
      } else {
        console.log(`Sending a mail to ${fullname}`);
        GmailApp.sendEmail(address, title, mailPlainBody, mailOptions);
      }
    } catch (e) {
      console.error(`Failed to send reminder to ${fullname} (${address}): ${e.message}`);
    }
  });
}

//
// Sends an apology email to all active members in case of an error.
//
function notifyError() {
  const mailData = {
    template: ConvertHtml.getMailTemplate("notifyError", MessageSS),
    title: "ワークエンゲージメント調査 誤配信のお詫び",
    mailPlainBody: "このメールはHTML形式で表示してください。",
    replacements: {} // No replacements needed for the error mail
  }
  sendBulkMail(mailData);
}
