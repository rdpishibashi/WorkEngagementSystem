const mode = PropertiesService.getScriptProperties().getProperty('Operation Mode');
const TestMode = mode === 'test' ? true : false;    // global variable

//
// The main function to respond with the analysis results of engagement.
//
function sendResponse(e) {
  let itemResponses = TestMode
    ? FormApp.getActiveForm().getResponses()[0].getItemResponses()
    : e.response.getItemResponses();

  setGlobals();

  const ColumnAddress = 0;
  const ColumnConcern = 10;
  const ColumnComment = 11;

  const address = itemResponses[ColumnAddress].getResponse().toLowerCase();
  const sendingAddress = TestMode ? "iryozo@rdpi.jp" : address;
  const engagementData = itemResponses.slice(1).map(response => response.getResponse()); // remove mail address and extract the following nine items
  const engagement = calcEngagement(engagementData); 
  const concern = itemResponses[ColumnConcern].getResponse();
  const comment = itemResponses[ColumnComment].getResponse();
  const responseDate = new Date();

  recordEngagement(address, responseDate, engagement, concern, comment);
  Logger.log("Recorded engagement data of " + address);

  // Specify the individual sheet of the member and set it the global variable.
  const memberIndex = Members.findIndex(member => member[AddressOnMember] === address);
  const name = (memberIndex !== -1)? Members[memberIndex][NameOnMember] : address;
  IndividualSheet = RatingSS.getSheetByName(name);  // Set as a global variable.

  const engagementStatus = makeIndividualSheet(address, name, responseDate, AnalysisPeriod);
  Logger.log("Made individual sheet of " + address);

  if ((name === address) && (!TestMode)) return;   // Non-registered member is not sent the report.

  // Set the number of times the article is sent.
  let articleCount = (memberIndex !== -1)? Members[memberIndex][CountOnMember] : 1;

  // Send the report.
  sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus, articleCount);
  Logger.log("Sent a report to " + name);

  // Update the number of times the article was sent.
  if (memberIndex !== -1) {
    articleCount++;
    MemberSheet.getRange(memberIndex + 1, CountOnMember + 1).setValue(articleCount);
    if (Members && Members[memberIndex]) {
      Members[memberIndex][CountOnMember] = articleCount;
    }
  }
}

//
// Analyze the user's input, record the results, and send the report.
//
function sendAnalysisReport(address, sendingAddress, name, responseDate, engagementStatus, articleCount) {
  const individualData = (typeof LastIndividualData !== "undefined") ? LastIndividualData : [];
  if (!individualData.length) {
    Logger.log("No individual data available for charts or email content.");
    return;
  }

  // Filter individual data to show only last ReportPeriod (6 months) in charts
  // Individual sheet contains AnalysisPeriod (12 months) for robust quantile calculations
  const startDate = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -ReportPeriod + 1);
  const chartData = individualData.length > 1
    ? [individualData[0]].concat(
        individualData.slice(1).filter(row => setResponseDate(row[DateLabel]) >= startDate)
      )
    : individualData;

  // グラフ定義
  const charts = [
    { chartFunc: individualEngagementChart, title: "ワークエンゲージメント推移" },
    { chartFunc: individualEngagementVariationChart, title: "ワークエンゲージメント増減" },
    { chartFunc: individualEngagementElementsChart, title: "ワークエンゲージメント構成要素" }
  ];

  // グラフを作成してcharts配列に追加
  const processedCharts = [];
  const inlineImages = {}; // GmailApp用
  charts.forEach((chart, index) => {
    const chartInstance = chart.chartFunc(chartData);
    if (chartInstance) {
      const blob = chartInstance.getBlob();
      processedCharts.push({
        title: chart.title,
        blob: blob
      });
      inlineImages[`graph${index + 1}`] = blob;
    }
  });

  // Get the email template
  const template = ConvertHtml.getMailTemplate("analysisReport", MessageSS);

  // Prepare replacements
  const replacements = {
    fullname: name,
    feedback: createFeedback(engagementStatus, individualData, name),
    comment: makeCommentList(address, responseDate, ReportPeriod),
    saying: createSaying(engagementStatus),
    wellbeingColumn: getColumn(articleCount)
  };

  // Process the template
  const htmlBody = ConvertHtml.createHtmlEmail(template, replacements, processedCharts, {});

  // Send the email
  GmailApp.sendEmail(sendingAddress, "ワークエンゲージメント調査結果", "", {
    htmlBody: htmlBody,
    inlineImages: inlineImages, 
    bcc: "iryozo@rdpi.jp",
    from: "ishibashi@rdpi.co.jp"
  });
}

function createFeedback(engagementStatus, individualData, name) {
  if (individualData.length <= 2) {  // the length includes the title header
    return "2ヶ月分の入力後にフィードバックを開始します。";
  }

  return makeEngagementComment(engagementStatus, name);
}

function createSaying(engagementStatus) {
  let negativeEngagementFactors = [];
  const weaknessCategories = parseCategories(engagementStatus.weakness_short);
  if (weaknessCategories.length > 0) {
    const randomIndex = Math.floor(Math.random() * weaknessCategories.length);
    negativeEngagementFactors = [weaknessCategories[randomIndex]];
  }
  const quote = getSaying(negativeEngagementFactors);

  return `${quote.saying}

　　　　　　　　　　　　　　　*—— ${quote.speaker}*`;
}

function getColumn(articleCount) {
  const [headerRow, ...notes] = ColumnSheet.getDataRange().getValues();
  const sequenceIndex = headerRow.indexOf("sequence");
  const noteIndex = headerRow.indexOf("wellbeing");

  const note = notes.find(row => row[sequenceIndex] === articleCount);
  return note ? note[noteIndex] : "今回はお休みです。";
}

//
// Retrieve sayings that match the engagement factor from the "saying" spreadsheet.
// One or more categories can be specified as a parameter.
// If the parameter is null, sayings from all categories will be considered.
//
function getSaying(category) {
  const sayingSheet = SayingSS.getSheetByName("saying");
  const sayings = sayingSheet.getDataRange().getValues();
  const headerRow = sayings.shift();
  const categoryIndex = headerRow.indexOf("category"); // Find the index of the "category" column

  // Map V/D/A codes to full category names
  const codeToCategory = {
    "v": "vigor",
    "d": "dedication",
    "a": "absorption"
  };

  // Convert category codes (V/D/A) to full names (vigor/dedication/absorption)
  const mappedCategories = category && category.length > 0
    ? category.map(code => codeToCategory[code.toLowerCase()] || code)
    : [];

  // Filter sayings based on category parameter
  let filteredData = sayings.filter(row => {
    return mappedCategories.length > 0
      ? mappedCategories.includes(row[categoryIndex])
      : row[categoryIndex] === null || row[categoryIndex] === "";
  });

  // If no match found, use all sayings
  if (filteredData.length === 0) {
    Logger.log(`No sayings found for category: ${category} (mapped to ${mappedCategories}). Using all sayings.`);
    filteredData = sayings;
  }

  // If still no data, return default
  if (filteredData.length === 0) {
    Logger.log("No sayings available in the spreadsheet.");
    return { saying: "Keep moving forward.", speaker: "Unknown" };
  }

  const randomRow = filteredData[Math.floor(Math.random() * filteredData.length)];
  return { saying: randomRow[0], speaker: randomRow[1] };
}
