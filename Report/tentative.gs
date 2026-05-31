setGlobals();

function test_analyzeEngagement() {
  const memberName = "森田 大貴";
  const sheet = RatingSS.getSheetByName(memberName);
  display_evaluation(sheet, memberName);
}

function test_all_analyzeEngagement() {
  Members.forEach((member, i) => {
    // Send only to active members (who have not left the company).
    const isActiveMember = !member[LeaveOnMember];
    if (isActiveMember) {
      const memberName = member[NameOnMember];
//      const memberEmail = member[ColumnMemberAddress];
      const sheet = RatingSS.getSheetByName(memberName);
      display_evaluation(sheet, memberName);
    }
  });
}

function display_evaluation(sheet, name) {

  Logger.log(name);
  if (!sheet) {
    Logger.log("No data sheet.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const engagementStatus = analyzeEngagement(data);
  Logger.log(createFeedback(engagementStatus, data, name));
  Logger.log("");
}

function test_advice() {
  const category = "vigor";
  const rank = "weakness_short";
  Logger.log(getAdviceText(category, rank));
}

function test_saying() {
  const memberName = "加治 洋一";
  const sheet = RatingSS.getSheetByName(memberName);
  const data = sheet.getDataRange().getValues();
  const engagementStatus = analyzeEngagement(data);
  const quote = createSaying(engagementStatus);
  Logger.log(quote);
}

function test_column() {
  const sendingAddress = "ishibashi@rdpi.jp"; 
  const template = ConvertHtml.getMailTemplate("analysisReport", MessageSS);
  const columnContent = getColumn(11);

  const replacements = {
    fullname: "石橋",
    feedback: "フィードバック今月も継続的な取り組みが成果として表れています。",
    comment: "コメント",
    saying: "「仕事を楽しむことができれば、人生の半分は楽しくなる」- デール・カーネギー",
    wellbeingColumn: columnContent
  };

  // テスト用のグラフデータ（実際のデータがない場合のダミー）
  const processedCharts = [
    { title: "ワークエンゲージメント推移", data: createDummyChartImage() },
    { title: "ワークエンゲージメント増減", data: createDummyChartImage() },
    { title: "ワークエンゲージメント構成要素", data: createDummyChartImage() }
  ];
  
  // グラフ画像をインライン画像として設定
  const inlineImages = {};
  processedCharts.forEach((chart, index) => {
    inlineImages[`graph${index + 1}`] = chart.data;
  });

  // HTMLメール本文を生成
  const htmlBody = ConvertHtml.createHtmlEmail(template, replacements, processedCharts, inlineImages);

  // メールを送信
  GmailApp.sendEmail(sendingAddress, "ワークエンゲージメント調査結果", "", {
    htmlBody: htmlBody,
    inlineImages: inlineImages, 
    bcc: "iryozo@rdpi.jp",
    from: "ishibashi@rdpi.co.jp",
    name: "石橋 - RDPi"
  });
  
  console.log(`メール送信完了: ${sendingAddress}`);
}

function createDummyChartImage() {
  // 簡単なダミー画像を生成（実際の運用では本物のグラフを使用）
  try {
    // 1x1ピクセルの透明画像（Base64エンコード）
    const transparentPixel = Utilities.newBlob(
      Utilities.base64Decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
      "image/png",
      "dummy.png"
    );
    return transparentPixel;
  } catch (e) {
    console.log("ダミー画像の生成に失敗しました: " + e.toString());
    return null;
  }
}
