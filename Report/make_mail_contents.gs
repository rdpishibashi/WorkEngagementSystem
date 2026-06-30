//
// Build the engagement comment by combining trend, level, stability, and factor advice.
//
function makeEngagementComment(engagementStatus, name) {
  const familyName = extractFamilyName(name);
  const paragraphs = [];

  const trendMessages = {
    "上昇加速": "中期的な上昇トレンドにある中、さらに今月は先月から大きく上昇しています。",
    "上昇継続": "中期的に上昇トレンドであり、今月も先月の水準を下回ることなく推移しています。",
    "低下懸念": "中期的には上昇トレンドなのですが、直近では変化が生じています。",
    "悪化": "中期的に上昇トレンドでしたが、今月は大きく低下しています。",
    "低下危機": "今月は先月から下降しており、上昇トレンドが一時的に弱まっています。",
    "低下加速": "中期的な低下トレンドに加え、今月は先月から大きく下降しています。",
    "低下継続": "中期的に低下トレンドで、今月も先月の水準を超えずに推移しています。",
    "回復期待": "中期的に低下トレンドですが、直近では下げ止まりの兆しが見られます。",
    "回復": "今月は先月から上昇しており、低下トレンドから回復する兆しが見られます。",
    "復活": "中期的に低下トレンドですが、今月は大きく上昇しています。",
    "上昇期待": "中期的なトレンドはフラットですが、今月は先月から上昇しています。",
    "低下警戒": "中期的なトレンドはフラットですが、今月は先月から低下しています。",
    "上昇": "今月は先月から上昇しています。",
    "下降": "今月は先月からの下降となっています。",
    "横ばい": "今月は先月からの目立った変化はありません。",
    "安定維持": "中期的に有意な増減傾向はなく、トレンドはフラットです。"
  };

  const introPrefix = familyName ? `${familyName}さんは、` : "あなたは、";
  let introSentence = introPrefix;
  const trendKey = typeof engagementStatus.trend_refined === "string"
    ? engagementStatus.trend_refined.trim()
    : "";
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

  if (trendKey && Object.prototype.hasOwnProperty.call(trendMessages, trendKey)) {
    const message = trendMessages[trendKey];
    introSentence += message;
  }
  appendParagraph(paragraphs, introSentence);
  
  if (level === "thriving") {
    appendParagraph(paragraphs, "直近のワーク･エンゲージメントはとても高いレベルです。");
    appendToLastParagraph(paragraphs, getAdviceText("engagement", "thriving"));
    if (weaknessShortCategories.length > 0) {
      sentence = `ただ、${combineAdviceSentences(weaknessAdvices)}低下している要素に注意しておきましょう。`;
      appendParagraph(paragraphs, sentence);
    }
    return paragraphs.join("\n\n");
  }

  if (trendKey && trendMessages[trendKey]) {
    appendToLastParagraph(paragraphs, getAdviceText("engagement", trendKey));
  }

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

  if (engagementStatus.volatility_6_p90 === "波動あり") {
    appendParagraph(paragraphs, "ところで、中期的に大きな変動があることが気になります。");
    const dir = engagementStatus.direction_6_p90;
    const volatilityRank =
      dir === "上昇"         ? "変動中上昇" :
      dir === "下降"         ? "変動中下降" :
      dir === "方向変化なし" ? "変動中"     :
                               "変動中安定"; // 判定保留 または フォールバック
    appendToLastParagraph(paragraphs, getAdviceText("engagement", volatilityRank));
  }

  if (engagementStatus.stability_6 === "不変") {
    sentence = "ところで、６ヶ月以上まったく変化がありません。この１ヶ月の出来事と自分の感情を振り返る良い機会です。活用しましょう。";
    appendParagraph(paragraphs, sentence);
  }

//  appendParagraph(paragraphs, lastSentence.join(" "));

  return paragraphs.join("\n\n");
}

//
// Create a list of the individual's comments for the period.
//
function makeCommentList(address, responseDate, period) {

  const comments = CommentSheet.getDataRange().getValues();
  const dataRows = comments.slice(1);  // Skip header row
  const userComments = dataRows.filter(comment => comment[Address] === address);

  const startDate = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -period + 1);

  let commentSummary = "##### ● 気になった出来事 ●\n\n";

  const recentConcerns = userComments
    .filter(comment =>
      comment[DateLabel] instanceof Date &&
      setResponseDate(comment[DateLabel]) >= startDate &&
      comment[ColumnCommentConcern] !== ""
    )
    .sort((a, b) => setResponseDate(b[DateLabel]) - setResponseDate(a[DateLabel]));

  recentConcerns.forEach(comment => {
    const dateString = `${comment[0]}-${comment[1]}`;
    commentSummary += `__${dateString}:__  \n${comment[ColumnCommentConcern]}\n\n`;
  });

  commentSummary += "##### ● ご意見やリクエスト ●\n\n";

  const recentComments = userComments
    .filter(comment =>
      comment[DateLabel] instanceof Date &&
      setResponseDate(comment[DateLabel]) >= startDate &&
      comment[ColumnCommentComment] !== ""
    )
    .sort((a, b) => setResponseDate(b[DateLabel]) - setResponseDate(a[DateLabel]));

  recentComments.forEach(comment => {
    const dateString = `${comment[0]}-${comment[1]}`;
    commentSummary += `__${dateString}:__  \n${comment[ColumnCommentComment]}\n\n`;
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
