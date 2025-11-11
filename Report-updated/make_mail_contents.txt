//
// Build the engagement comment by combining trend, level, stability, and factor advice.
//
function makeEngagementComment(engagementStatus, name) {
  const familyName = extractFamilyName(name);
  const paragraphs = [];

  const trendMessages = {
    "上昇加速": {
      message: "中期的に上昇傾向のワーク･エンゲージメントであり、直近でさらに上昇しています。",
      rank: "surging"
    },
    "上昇継続": {
      message: "中期的に上昇傾向のワーク･エンゲージメントです。",
      rank: "rising"
    },
    "低下懸念": {
      message: "中期的に上昇傾向だったワーク･エンゲージメントが、直近では低下しています。",
      rank: "weakening"
    },
    "悪化": {
      message: "中期的に上昇傾向だったワーク･エンゲージメントが、低下傾向となっています。",
      rank: "worsening"
    },
    "低下危機": {
      message: "中期的に上昇傾向だったワーク･エンゲージメントが、以前よりも低い状態となっています。",
      rank: "severe"
    },
    "低下加速": {
      message: "中期的に低下傾向のワーク･エンゲージメントとなっている中、直近でさらに低下しています。",
      rank: "slumping"
    },
    "低下継続": {
      message: "中期的に低下傾向のワーク･エンゲージメントです。",
      rank: "declining"
    },
    "回復期待": {
      message: "中期的に低下傾向だったワーク･エンゲージメントですが、直近では上昇しています。",
      rank: "hopeful"
    },
    "回復": {
      message: "中期的に低下傾向だったワーク･エンゲージメントですが、回復傾向となっています。",
      rank: "recovering"
    },
    "復活": {
      message: "中期的に低下傾向だったワーク･エンゲージメントですが、以前よりも高い状態となっています。",
      rank: "resurgence"
    },
    "上昇期待": {
      message: "中期的に安定したワーク･エンゲージメントですが、直近で上昇しています。",
      rank: "improving"
    },
    "低下警戒": {
      message: "中期的に安定したワーク･エンゲージメントですが、直近では低下しています。",
      rank: "cautious"
    },
    "上昇": {
      message: "短期的にワーク･エンゲージメントが上昇しています。",
      rank: "waiting"
    },
    "下降": {
      message: "短期的にワーク･エンゲージメントが低下しています。",
      rank: "waiting"
    },
    "横ばい": {
      message: "短期的に安定したワーク･エンゲージメントです。",
      rank: "waiting"
    },
    "安定維持": {
      message: "中期的にも短期的にも、安定したワーク･エンゲージメントを維持しています。",
      rank: "stable"
    }
  };

  const introPrefix = familyName ? `${familyName}さんは、` : "あなたは、";
  let introSentence = introPrefix;
  let trendRank = null;
  const trendKey = typeof engagementStatus.trend_refined === "string"
    ? engagementStatus.trend_refined.trim()
    : "";
  if (trendKey && Object.prototype.hasOwnProperty.call(trendMessages, trendKey)) {
    const { message, rank } = trendMessages[trendKey];
    introSentence += message;
    trendRank = rank;
  }
  appendParagraph(paragraphs, introSentence);

  if (trendRank) {
    appendToLastParagraph(paragraphs, getAdviceText("engagement", trendRank));
  }

  const level = typeof engagementStatus.level === "string"
    ? engagementStatus.level.toLowerCase()
    : "";

  if (level === "thriving") {
    appendParagraph(paragraphs, "直近のワーク･エンゲージメントはとても高いレベルとなっており、すばらしいです。");
    appendToLastParagraph(paragraphs, getAdviceText("engagement", "thriving"));
  }

  if (level === "critical") {
    appendParagraph(paragraphs, "ただ、直近のワーク･エンゲージメントがかなり低いレベルとなっていることには、注意しておいてください。");
    appendToLastParagraph(paragraphs, getAdviceText("engagement", "critical"));
  }

  const closingNotes = [];

  const positiveTrends = new Set(["上昇加速", "上昇継続", "回復期待", "回復", "復活", "上昇期待", "上昇"]);
  const negativeTrends = new Set(["低下懸念", "悪化", "低下危機", "低下加速", "低下継続", "低下警戒", "下降"]);
  const neutralTrends = new Set(["安定", "安定維持"]);
  const treatAsPositive = positiveTrends.has(trendKey);
  const treatAsNegative = negativeTrends.has(trendKey);

  if (treatAsPositive) {
    const strengthCategories = parseCategories(engagementStatus.strength_short);
    if (strengthCategories.length > 0) {
      const strengthDisplay = formatCategoryDisplay(strengthCategories);
      const strengthAdvices = strengthCategories
        .map(category => getAdviceText(category, "strength_short"))
        .filter(advice => typeof advice === "string" && advice.trim() !== "");
      if (strengthAdvices.length > 0) {
        const strengthSentence = `最近の上昇は${strengthDisplay}の要因による寄与が大きく、${combineAdviceSentences(strengthAdvices)}`;
        appendParagraph(paragraphs, strengthSentence);
      }

      const weaknessCategories = parseCategories(engagementStatus.weakness_short);
      if (weaknessCategories.length > 0) {
        const weaknessDisplay = formatCategoryDisplay(weaknessCategories);
        const weaknessAdvices = weaknessCategories
          .map(category => getAdviceText(category, "weakness_short"))
          .filter(advice => typeof advice === "string" && advice.trim() !== "");
        if (weaknessAdvices.length > 0) {
          const weaknessSentence = `一方、${weaknessDisplay}の要因が低下しているので、注意しておきましょう。${combineAdviceSentences(weaknessAdvices)}`;
          appendParagraph(paragraphs, weaknessSentence);
        }
      }
    }
  }

  if (treatAsNegative) {
    const weaknessCategories = parseCategories(engagementStatus.weakness_short);
    if (weaknessCategories.length > 0) {
      const weaknessDisplay = formatCategoryDisplay(weaknessCategories);
      const weaknessAdvices = weaknessCategories
        .map(category => getAdviceText(category, "weakness_short"))
        .filter(advice => typeof advice === "string" && advice.trim() !== "");
      if (weaknessAdvices.length > 0) {
        const weaknessSentence = `直近の低下は${weaknessDisplay}の要因による影響が大きく、${combineAdviceSentences(weaknessAdvices)}`;
        appendParagraph(paragraphs, weaknessSentence);
      }
    }

    const strengthCategories = parseCategories(engagementStatus.strength_short);
    if (strengthCategories.length > 0) {
      const strengthDisplay = formatCategoryDisplay(strengthCategories);
      const strengthAdvices = strengthCategories
        .map(category => getAdviceText(category, "strength_short"))
        .filter(advice => typeof advice === "string" && advice.trim() !== "");
      if (strengthAdvices.length > 0) {
        const strengthSentence = `一方、${strengthDisplay}の要因は上昇しているので、今後に活かしましょう。${combineAdviceSentences(strengthAdvices)}`;
        appendParagraph(paragraphs, strengthSentence);
      }
    }
  }

  if (neutralTrends.has(trendKey)) {
    const strengthCategories = parseCategories(engagementStatus.strength_short);
    if (strengthCategories.length > 0) {
      const strengthDisplay = formatCategoryDisplay(strengthCategories);
      appendParagraph(paragraphs, `ちなみに、直近では${strengthDisplay}が上昇しているので、ワーク･エンゲージメントが高まる兆しといえるでしょう。`);
    }
    const weaknessCategories = parseCategories(engagementStatus.weakness_short);
    if (weaknessCategories.length > 0) {
      const weaknessDisplay = formatCategoryDisplay(weaknessCategories);
      appendParagraph(paragraphs, `ちなみに、直近では${weaknessDisplay}が低下しているので、注意しておきましょう。`);
    }
  }

  if (engagementStatus.change_tag === "変化大") {
    closingNotes.push("直近の変化が大きい理由や原因を自己分析しておくと、今後に役立つはずです。");
  }

  if (engagementStatus.stability === "不安定") {
    closingNotes.push("中期的に変動が大きいことが気になります。外部環境に左右されないことを意識しておくとよいでしょう。");
  }

  if (engagementStatus.stability === "不変") {
    closingNotes.push("ところで、もしかすると回答することを面倒に感じていますか？ 自分の感情を振り返ることで自分を深く知る良い機会ですので、活用してほしいです。");
  }

  if (closingNotes.length > 0) {
    appendParagraph(paragraphs, closingNotes.join(" "));
  }

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
