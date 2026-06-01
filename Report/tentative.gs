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

// ===== direction_6 / volatility_6 の parity テスト =====
// 期待値は Playbook/we_analyzer.py（同一 engagement 系列）で算出したもの。
// GAS の analyzeEngagement 出力が we_analyzer.py と一致することを確認する。
// Apps Script エディタで testDirectionVolatilityParity() を実行 → 実行ログを確認。
function testDirectionVolatilityParity() {
  const fixtures = [
    { name: "A_accel_rise", dir: "上昇", vol: "波動なし",
      e: [10.0,10.2,10.8,11.8,13.2,15.0,17.2,19.8,22.8,26.2,30.0,34.2,38.8,43.8] },
    { name: "B_osc", dir: "判定保留", vol: "波動あり",
      e: [30,30,30,30,30,30,30,30,30,30,22,38,22,38,22,38] },
    { name: "C_steady", dir: "横ばい", vol: "波動なし",
      e: [10,12,14,16,18,20,22,24,26,28,30,32,34,36] },
    { name: "D_decline", dir: "下降", vol: "波動なし",
      e: [44.0,43.8,43.2,42.2,40.8,39.0,36.8,34.2,31.2,27.8,24.0,19.8,15.2,10.2] },
  ];

  const header = ["year", "month", "mail address", "engagement", "vigor", "dedication", "absorption"];
  let pass = 0;

  fixtures.forEach(fx => {
    const data = [header];
    fx.e.forEach((eng, i) => {
      const y = 2024 + Math.floor(i / 12);
      const m = (i % 12) + 1;
      const vda = eng / 3.0;   // V=D=A=E/3（direction/volatility は engagement のみ使用）
      data.push([y, m, "parity@test", eng, vda, vda, vda]);
    });
    const r = analyzeEngagement(data);
    const okDir = r.direction_6_p90 === fx.dir;
    const okVol = r.volatility_6_p90 === fx.vol;
    if (okDir && okVol) pass++;
    Logger.log(`${fx.name}: direction=${r.direction_6_p90}(${okDir ? "OK" : "NG 期待:" + fx.dir})` +
               ` volatility=${r.volatility_6_p90}(${okVol ? "OK" : "NG 期待:" + fx.vol})`);
  });

  Logger.log(`parity: ${pass}/${fixtures.length} 一致`);
}
