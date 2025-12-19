//
// Build the engagement comment by combining trend, level, stability, and factor advice.
//
function makeEngagementComment(engagementStatus, name) {
  const familyName = extractFamilyName(name);
  const paragraphs = [];

  const trendMessages = {
    "上昇加速": "今月は先月から大きく上昇しており、中期的にも上昇が続いています。",
    "上昇継続": "今月は先月から上昇しており、中期的にも上昇傾向です。",
    "低下懸念": "中期的に上昇傾向でしたが、直近では上昇傾向に変化が生じています。",
    "悪化": "今月は先月から下降しており、上昇傾向だった以前よりも低い値となっています。",
    "低下危機": "今月は先月から下降しており、上昇傾向からの低下となっています。",
    "低下加速": "今月は先月から大きく下降しており、中期的にも低下が続いています。",
    "低下継続": "今月は先月から下降しており、中期的にも低下傾向です。",
    "回復期待": "中期的には低下傾向でしたが、直近では下げ止まりの兆しが見られます。",
    "回復": "今月は先月から上昇しており、低下傾向から回復しています。",
    "復活": "今月は先月から上昇しており、さらに以前よりも高い状態となっています。",
    "上昇期待": "中期的に安定した状態の中、今月は先月から上昇しています。",
    "低下警戒": "中期的に安定した状態の中、今月は先月から低下しています。",
    "上昇": "今月は先月から上昇しています。",
    "下降": "今月は先月からの下降となっています。",
    "横ばい": "今月は先月からの目立った変化はありません。",
    "安定維持": "安定したワーク･エンゲージメントの状態です。"
  };

  const introPrefix = familyName ? `${familyName}さんは、` : "あなたは、";
  let introSentence = introPrefix;
  const trendKey = typeof engagementStatus.trend_refined === "string"
    ? engagementStatus.trend_refined.trim()
    : "";
  if (trendKey && Object.prototype.hasOwnProperty.call(trendMessages, trendKey)) {
    const message = trendMessages[trendKey];
    introSentence += message;
  }
  appendParagraph(paragraphs, introSentence);

  if (trendKey && trendMessages[trendKey]) {
    appendToLastParagraph(paragraphs, getAdviceText("engagement", trendKey));
  }

  const level = typeof engagementStatus.level === "string"
    ? engagementStatus.level.toLowerCase()
    : "";

  const positiveTrends = new Set(["上昇加速", "上昇継続", "回復期待", "回復", "復活", "上昇期待", "上昇"]);
  const negativeTrends = new Set(["低下懸念", "悪化", "低下危機", "低下加速", "低下継続", "低下警戒", "下降"]);
  const neutralTrends = new Set(["横ばい", "安定維持"]);

  const treatAsPositive = positiveTrends.has(trendKey);
  const treatAsNegative = negativeTrends.has(trendKey);
  const treatAsNeutral = neutralTrends.has(trendKey); 

  const weaknessShortCategories = parseCategories(engagementStatus.weakness_short);
  const strengthShortCategories = parseCategories(engagementStatus.strength_short);
  const strengthMidCategories = parseCategories(engagementStatus.strength_mid);

  const weaknessShortDisplay = formatCategoryDisplay(weaknessShortCategories);
  const strengthShortDisplay = formatCategoryDisplay(strengthShortCategories);
  const strengthMidDisplay = formatCategoryDisplay(strengthMidCategories);

  const strengthAdvices = strengthShortCategories
   .map(category => getAdviceText(category, "strength_short"))
   .filter(advice => typeof advice === "string" && advice.trim() !== "");
  const weaknessAdvices = weaknessShortCategories
    .map(category => getAdviceText(category, "weakness_short"))
    .filter(advice => typeof advice === "string" && advice.trim() !== "");

  let sentence = "";
  let lastSentence = "";

  // Helper function to check if arrays have common elements
  const hasCommonElements = (arr1, arr2) => {
    return arr1.some(item => arr2.includes(item));
  };

  if (treatAsPositive) {
    if (strengthShortCategories.length > 0) {
      sentence = `ちなみに、上昇している要素は${strengthShortDisplay}です。${combineAdviceSentences(strengthAdvices)}`;
      appendParagraph(paragraphs, sentence);

      // Check if there are mid-term strengths not already in short-term strengths
      if (strengthMidCategories.length > 0 && !hasCommonElements(strengthMidCategories, strengthShortCategories)) {
        sentence = `さらに、中期的な強みには${strengthMidDisplay}もあります。`;
        appendToLastParagraph(paragraphs, sentence);
      }
      lastSentence = "強みを活かして今後も上昇を目指しましょう。";
    } else if (strengthMidCategories.length > 0) {
      sentence = `中期的な強みに${strengthMidDisplay}があります。`;
      appendParagraph(paragraphs, sentence);
      lastSentence = "強みを活かして今後も上昇を目指しましょう。";
    } else
      lastSentence = "今後も上昇を目指しましょう。";
    appendToLastParagraph(paragraphs, lastSentence);

    if (level === "thriving") {
      appendParagraph(paragraphs, "加えて、直近のワーク･エンゲージメントはとても高いレベルです。");
      appendToLastParagraph(paragraphs, getAdviceText("engagement", "thriving"));
    }
    if (level === "critical") {
      appendParagraph(paragraphs, "一方、直近のワーク･エンゲージメントはかなり低いレベルとなっていることには注意しておいてください。");
      appendToLastParagraph(paragraphs, getAdviceText("engagement", "critical"));
    }
  }

  if (treatAsNegative) {
    if (weaknessShortCategories.length > 0) {
      sentence = `ちなみに、下降している要素は${weaknessShortDisplay}です。${combineAdviceSentences(weaknessAdvices)}`;
      appendParagraph(paragraphs, sentence);

      if (strengthShortCategories.length > 0) {
        sentence = `ただ、${strengthShortDisplay}は上昇しているので、この強みを活かしましょう。${combineAdviceSentences(strengthAdvices)}`;
        appendToLastParagraph(paragraphs, sentence);

        // Check if there are mid-term strengths not already in short-term strengths
        if (strengthMidCategories.length > 0 && !hasCommonElements(strengthMidCategories, strengthShortCategories)) {
          sentence = `加えて、中期的な強みとなっている${strengthMidDisplay}も活かせるはずです。`;
          appendToLastParagraph(paragraphs, sentence);
        }
        lastSentence = "強みを活かすことで上昇に変えることができるはずです。";
      } else if (strengthMidCategories.length > 0) {
        sentence = `ただ、中期的な強みに${strengthMidDisplay}があります。この強みを活かすことを工夫しましょう。`;
        appendParagraph(paragraphs, sentence);
        lastSentence = "強みを活かすことで上昇に変えることができるはずです。";
      } else
        lastSentence = "この状況を変えることを目指しましょう。";
    } else
      lastSentence = "この状況を変えることを目指しましょう。";
    appendToLastParagraph(paragraphs, lastSentence);

    if (level === "thriving") {
      appendParagraph(paragraphs, "一方、直近のワーク･エンゲージメントはとても高いレベルです。");
      appendToLastParagraph(paragraphs, getAdviceText("engagement", "thriving"));
    }
    if (level === "critical") {
      appendParagraph(paragraphs, "加えて、直近のワーク･エンゲージメントはかなり低いレベルとなっていることには注意しておいてください。");
      appendToLastParagraph(paragraphs, getAdviceText("engagement", "critical"));
    }
  }

  if (treatAsNeutral) {
    if (strengthShortCategories.length > 0) {
      sentence = `上昇している要素の${strengthShortDisplay}を活かして上昇を目指しましょう。${combineAdviceSentences(strengthAdvices)}`;
      appendParagraph(paragraphs, sentence);
    }
    if (weaknessShortCategories.length > 0) {
      sentence = `ただし、低下している要素に${weaknessShortDisplay}があるので注意しておきましょう。${combineAdviceSentences(weaknessAdvices)}`;
      appendParagraph(paragraphs, sentence);
    }
    if (level === "thriving") {
      appendParagraph(paragraphs, "ちなみに、直近のワーク･エンゲージメントはとても高いレベルです。");
      appendToLastParagraph(paragraphs, getAdviceText("engagement", "thriving"));
    }
    if (level === "critical") {
      appendParagraph(paragraphs, "また、直近のワーク･エンゲージメントはかなり低いレベルとなっていることには注意しておいてください。");
      appendToLastParagraph(paragraphs, getAdviceText("engagement", "critical"));
    }
    sentence = "安定を大切にしつつ、新しい自分を目指すための行動をはじめてみませんか？";
    appendParagraph(paragraphs, sentence);
  }

  if (engagementStatus.stability === "不安定") {
    sentence = "ところで、長期的には変動が大きいことが気になります。環境などの外部要因や仕事内容の影響に左右されないことを意識しておくといいでしょう。";
    appendParagraph(paragraphs, sentence);
  }

  if (engagementStatus.stability === "不変") {
    sentence = "ところで、もしかすると回答することを面倒に感じていますか？ 自分の感情を振り返ることで自分を深く知る良い機会ですので、活用してほしいです。";
    appendParagraph(paragraphs, sentence);
  }

//  appendParagraph(paragraphs, lastSentence.join(" "));

  return paragraphs.join("\n\n");
}

//
// Create a list of the individual's comments for the period.
//
function makeCommentList(address, responseDate, period) {
  // Column definition for Comment sheet
  const colConcern = 14;
  const colComment = 15;

  const comments = CommentSheet.getDataRange().getValues();
  const userComments = comments.filter(comment => comment[Address] === address);

  const startDate = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -period + 1);

  let commentSummary = "##### ● 気になった出来事 ●\n\n";

  const recentConcerns = userComments
    .filter(comment =>
      setResponseDate(comment[DateLabel]) >= startDate && comment[colConcern - 1] !== ""
    )
    .sort((a, b) => setResponseDate(b[DateLabel]) - setResponseDate(a[DateLabel]));

  recentConcerns.forEach(comment => {
    const dateString = `${comment[0]}-${comment[1]}`;
    commentSummary += `__${dateString}:__  \n${comment[colConcern - 1]}\n\n`;
  });

  commentSummary += "##### ● ご意見やリクエスト ●\n\n";

  const recentComments = userComments
    .filter(comment =>
      setResponseDate(comment[DateLabel]) >= startDate && comment[colComment - 1] !== ""
    )
    .sort((a, b) => setResponseDate(b[DateLabel]) - setResponseDate(a[DateLabel]));

  recentComments.forEach(comment => {
    const dateString = `${comment[0]}-${comment[1]}`;
    commentSummary += `__${dateString}:__  \n${comment[colComment - 1]}\n\n`;
  });

  return commentSummary.replace(/\r\n?/g, '\n');
}

function getAdviceText(category, rank) {
  // Map V/D/A codes to full category names for sheet names
  const codeToCategory = {
    "v": "vigor",
    "d": "dedication",
    "a": "absorption"
  };

  // Convert category code (V/D/A) to full name if needed
  const sheetName = codeToCategory[category.toLowerCase()] || category;

  const adviceSheet = AdviceSS.getSheetByName(sheetName);
  if (!adviceSheet) {
    Logger.log(`Sheet not found: ${sheetName} (from category: ${category})`);
    return "";
  }

  const advices = adviceSheet.getDataRange().getValues();
  const headerRow = advices.shift();
  const rankIndex = headerRow.indexOf("rank");

  const filteredData = advices.filter(row => row[rankIndex] === rank);

  if (filteredData.length === 0) {
    return "";
  }

  const randomIndex = Math.floor(Math.random() * filteredData.length);
  
  return filteredData[randomIndex][0] || "";
}

//
// Helpers.
//
function extractFamilyName(fullName) {
  if (!fullName) {
    return "";
  }
  const tokens = fullName.trim().split(/\s+/);
  return tokens[0] || "";
}

const CATEGORY_DISPLAY_NAMES = {
  vigor: "活力",
  dedication: "熱意",
  absorption: "没頭",
  v: "活力",
  d: "熱意",
  a: "没頭"
};

function parseCategories(factorString) {
  if (!factorString) {
    return [];
  }
  return factorString
    .split(/[、,]/)
    .map(token => token.trim().toLowerCase())
    .filter(token => token !== "");
}

function formatCategoryDisplay(categories) {
  if (!categories || categories.length === 0) {
    return "";
  }
  return categories
    .map(category => CATEGORY_DISPLAY_NAMES[category] || category)
    .join("、");
}

function combineAdviceSentences(sentences) {
  const connectors = ["", "加えて、", "さらに、"];
  const parts = [];
  let index = 0;
  sentences.forEach(sentence => {
    if (!sentence) {
      return;
    }
    const trimmed = typeof sentence === "string" ? sentence.trim() : "";
    if (trimmed === "") {
      return;
    }
    const prefix = index < connectors.length ? connectors[index] : "また、";
    parts.push(`${prefix}${trimmed}`);
    index += 1;
  });
  return parts.join("");
}

function appendParagraph(paragraphs, text) {
  if (typeof text !== "string") {
    return;
  }
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (sanitized !== "") {
    paragraphs.push(sanitized);
  }
}

function appendToLastParagraph(paragraphs, text) {
  if (typeof text !== "string") {
    return;
  }
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (sanitized === "") {
    return;
  }
  if (paragraphs.length === 0) {
    paragraphs.push(sanitized);
  } else {
    paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]}\n${sanitized}`;
  }
}
