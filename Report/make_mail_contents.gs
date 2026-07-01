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
  const strengthMidAdvices = strengthMidCategories
    .map(category => getAdviceText(category, "strength_mid"))
    .filter(advice => typeof advice === "string" && advice.trim() !== "");

  if (trendKey && Object.prototype.hasOwnProperty.call(trendMessages, trendKey)) {
    const message = trendMessages[trendKey];
    introSentence += message;
  }
  appendParagraph(paragraphs, introSentence);

  let sentence = "";
  let lastSentence = "";

  if (level === "thriving") {
    appendParagraph(paragraphs, "直近のワーク･エンゲージメントはとても高いレベルです。");
    appendToLastParagraph(paragraphs, getAdviceText("engagement", "thriving"));
    if (weaknessShortCategories.length > 0) {
      const primary = pickPrimaryFactor(engagementStatus, "negative");
      if (primary) {
        const disp = CATEGORY_DISPLAY_NAMES[primary.code.toLowerCase()];
        const pair = getAdvicePair(primary.code, primary.rank);
        sentence = `ただ、${disp}が低下しているので注意しておきましょう。${pair.state}${pair.action}`;
      } else {
        sentence = `ただ、${combineAdviceSentences(weaknessAdvices)}低下している要素に注意しておきましょう。`;
      }
      appendParagraph(paragraphs, sentence);
    }
    return paragraphs.join("\n\n");
  }

  if (trendKey && trendMessages[trendKey]) {
    appendToLastParagraph(paragraphs, getAdviceText("engagement", trendKey));
  }

  sentence = "";
  lastSentence = "";

  // Helper function to check if arrays have common elements
  const hasCommonElements = (arr1, arr2) => {
    return arr1.some(item => arr2.includes(item));
  };

  if (treatAsPositive) {
    const primary = pickPrimaryFactor(engagementStatus, "positive");
    if (primary) {
      const disp = CATEGORY_DISPLAY_NAMES[primary.code.toLowerCase()];
      const pair = getAdvicePair(primary.code, primary.rank);
      sentence = `ちなみに、今回の上昇を最も牽引したのは${disp}です。${pair.state}${pair.action}`;
      appendParagraph(paragraphs, sentence);
      const counter = pickCounterFactor(engagementStatus, "positive");
      if (counter) {
        const disp2 = CATEGORY_DISPLAY_NAMES[counter.code.toLowerCase()];
        const pair2 = getAdvicePair(counter.code, counter.rank);
        sentence = `ただし、${disp2}は逆に低下しています。${pair2.state}${pair2.action}`;
        appendParagraph(paragraphs, sentence);
      }
      lastSentence = "強みを活かして今後も上昇を目指しましょう。";
    } else {
      const midPrimary = pickPrimaryFactorMid(engagementStatus, "positive");
      if (midPrimary) {
        const disp = CATEGORY_DISPLAY_NAMES[midPrimary.code.toLowerCase()];
        const pair = getAdvicePair(midPrimary.code, midPrimary.rank);
        sentence = `ちなみに、中期的に${disp}が上昇傾向にあります。${pair.state}${pair.action}`;
        appendParagraph(paragraphs, sentence);
        lastSentence = "強みを活かして今後も上昇を目指しましょう。";
      } else {
        // Fallback: existing multi-factor display
        if (strengthShortCategories.length > 0) {
          sentence = `ちなみに、上昇している要素は${strengthShortDisplay}です。${combineAdviceSentences(strengthAdvices)}`;
          appendParagraph(paragraphs, sentence);
          if (strengthMidCategories.length > 0 && !hasCommonElements(strengthMidCategories, strengthShortCategories)) {
            sentence = `さらに、中期的な強みには${strengthMidDisplay}もあります。${combineAdviceSentences(strengthMidAdvices)}`;
            appendToLastParagraph(paragraphs, sentence);
          }
          lastSentence = "強みを活かして今後も上昇を目指しましょう。";
        } else if (strengthMidCategories.length > 0) {
          sentence = `中期的な強みに${strengthMidDisplay}があります。${combineAdviceSentences(strengthMidAdvices)}`;
          appendParagraph(paragraphs, sentence);
          lastSentence = "強みを活かして今後も上昇を目指しましょう。";
        } else {
          lastSentence = "今後も上昇を目指しましょう。";
        }
      }
    }
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
    const primary = pickPrimaryFactor(engagementStatus, "negative");
    if (primary) {
      const disp = CATEGORY_DISPLAY_NAMES[primary.code.toLowerCase()];
      const pair = getAdvicePair(primary.code, primary.rank);
      sentence = `ちなみに、今回の低下に最も影響したのは${disp}です。${pair.state}${pair.action}`;
      appendParagraph(paragraphs, sentence);
      const counter = pickCounterFactor(engagementStatus, "negative");
      if (counter) {
        const disp2 = CATEGORY_DISPLAY_NAMES[counter.code.toLowerCase()];
        const pair2 = getAdvicePair(counter.code, counter.rank);
        sentence = `一方で、${disp2}は上昇しています。${pair2.state}${pair2.action}`;
        appendParagraph(paragraphs, sentence);
      }
      lastSentence = "この状況を変えることを目指しましょう。";
    } else {
      const midPrimary = pickPrimaryFactorMid(engagementStatus, "negative");
      if (midPrimary) {
        const disp = CATEGORY_DISPLAY_NAMES[midPrimary.code.toLowerCase()];
        const pair = getAdvicePair(midPrimary.code, midPrimary.rank);
        sentence = `ちなみに、中期的に${disp}が低下傾向にあります。${pair.state}${pair.action}`;
        appendParagraph(paragraphs, sentence);
        lastSentence = "この状況を変えることを目指しましょう。";
      } else {
        // Fallback: existing multi-factor display
        if (weaknessShortCategories.length > 0) {
          sentence = `ちなみに、下降している要素は${weaknessShortDisplay}です。${combineAdviceSentences(weaknessAdvices)}`;
          appendParagraph(paragraphs, sentence);
          if (strengthShortCategories.length > 0) {
            sentence = `ただ、${strengthShortDisplay}は上昇しているので、この強みを活かしましょう。${combineAdviceSentences(strengthAdvices)}`;
            appendToLastParagraph(paragraphs, sentence);
            if (strengthMidCategories.length > 0 && !hasCommonElements(strengthMidCategories, strengthShortCategories)) {
              sentence = `加えて、中期的な強みとなっている${strengthMidDisplay}も活かせるはずです。${combineAdviceSentences(strengthMidAdvices)}`;
              appendToLastParagraph(paragraphs, sentence);
            } else if (strengthMidAdvices.length > 0) {
              appendToLastParagraph(paragraphs, combineAdviceSentences(strengthMidAdvices));
            }
            lastSentence = "強みを活かすことで上昇に変えることができるはずです。";
          } else if (strengthMidCategories.length > 0) {
            sentence = `ただ、中期的な強みに${strengthMidDisplay}があります。この強みを活かすことを工夫しましょう。${combineAdviceSentences(strengthMidAdvices)}`;
            appendParagraph(paragraphs, sentence);
            lastSentence = "強みを活かすことで上昇に変えることができるはずです。";
          } else {
            lastSentence = "この状況を変えることを目指しましょう。";
          }
        } else {
          if (strengthMidCategories.length > 0) {
            sentence = `中期的な強みに${strengthMidDisplay}があります。${combineAdviceSentences(strengthMidAdvices)}`;
            appendParagraph(paragraphs, sentence);
            lastSentence = "強みを活かすことで上昇に変えることができるはずです。";
          } else {
            lastSentence = "この状況を変えることを目指しましょう。";
          }
        }
      }
    }
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
    const up = pickPrimaryFactor(engagementStatus, "positive");
    if (up) {
      const disp = CATEGORY_DISPLAY_NAMES[up.code.toLowerCase()];
      const pair = getAdvicePair(up.code, up.rank);
      sentence = `${disp}が上昇しています。${pair.state}${pair.action}`;
      appendParagraph(paragraphs, sentence);
    } else {
      const midUp = pickPrimaryFactorMid(engagementStatus, "positive");
      if (midUp) {
        const disp = CATEGORY_DISPLAY_NAMES[midUp.code.toLowerCase()];
        const pair = getAdvicePair(midUp.code, midUp.rank);
        sentence = `中期的に${disp}が上昇傾向にあります。${pair.state}${pair.action}`;
        appendParagraph(paragraphs, sentence);
      } else if (strengthShortCategories.length > 0) {
        sentence = `上昇している要素の${strengthShortDisplay}を活かして上昇を目指しましょう。${combineAdviceSentences(strengthAdvices)}`;
        appendParagraph(paragraphs, sentence);
      }
    }

    const down = pickPrimaryFactor(engagementStatus, "negative");
    if (down) {
      const disp = CATEGORY_DISPLAY_NAMES[down.code.toLowerCase()];
      const pair = getAdvicePair(down.code, down.rank);
      sentence = `ただし、${disp}が低下しています。${pair.state}${pair.action}`;
      appendParagraph(paragraphs, sentence);
    } else {
      const midDown = pickPrimaryFactorMid(engagementStatus, "negative");
      if (midDown) {
        const disp = CATEGORY_DISPLAY_NAMES[midDown.code.toLowerCase()];
        const pair = getAdvicePair(midDown.code, midDown.rank);
        sentence = `ただし、中期的に${disp}が低下傾向にあります。${pair.state}${pair.action}`;
        appendParagraph(paragraphs, sentence);
      } else if (weaknessShortCategories.length > 0) {
        sentence = `ただし、低下している要素に${weaknessShortDisplay}があるので注意しておきましょう。${combineAdviceSentences(weaknessAdvices)}`;
        appendParagraph(paragraphs, sentence);
      }
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

function getAdviceText(category, rank, column = "advice") {
  const codeToCategory = {
    "v": "vigor",
    "d": "dedication",
    "a": "absorption"
  };

  const sheetName = codeToCategory[category.toLowerCase()] || category;

  const adviceSheet = AdviceSS.getSheetByName(sheetName);
  if (!adviceSheet) {
    Logger.log(`Sheet not found: ${sheetName} (from category: ${category})`);
    return "";
  }

  const advices = adviceSheet.getDataRange().getValues();
  const headerRow = advices.shift();
  const rankIndex = headerRow.indexOf("rank");
  const colIndex = headerRow.indexOf(column);
  if (colIndex === -1) { return ""; }

  const filteredData = advices.filter(row => row[rankIndex] === rank);
  if (filteredData.length === 0) { return ""; }

  const randomIndex = Math.floor(Math.random() * filteredData.length);
  return filteredData[randomIndex][colIndex] || "";
}

function getAdvicePair(category, rank) {
  const codeToCategory = { "v": "vigor", "d": "dedication", "a": "absorption" };
  const sheetName = codeToCategory[category.toLowerCase()] || category;
  const sheet = AdviceSS.getSheetByName(sheetName);
  if (!sheet) return { state: "", action: "" };
  const rows = sheet.getDataRange().getValues();
  const header = rows.shift();
  const iRank = header.indexOf("rank");
  const iState = header.indexOf("advice");
  const iAction = header.indexOf("advice_action");
  const filtered = rows.filter(r => r[iRank] === rank);
  if (!filtered.length) return { state: "", action: "" };
  const r = filtered[Math.floor(Math.random() * filtered.length)];
  return {
    state: iState >= 0 ? (r[iState] || "") : "",
    action: iAction >= 0 ? (r[iAction] || "") : "",
  };
}

// direction: "positive" | "negative"
// Returns { code: "V"|"D"|"A", rank: "strength_short"|"weakness_short" } or null
function pickPrimaryFactor(status, direction) {
  const SHORT_MIN_DELTA = 2.0;
  const deltas = {
    V: Number(status.V_delta_1),
    D: Number(status.D_delta_1),
    A: Number(status.A_delta_1),
  };
  let best = null;
  for (const code of ["V", "D", "A"]) {
    const d = deltas[code];
    if (!Number.isFinite(d)) continue;
    if (direction === "positive" && d <= 0) continue;
    if (direction === "negative" && d >= 0) continue;
    if (Math.abs(d) < SHORT_MIN_DELTA) continue;
    if (best === null || Math.abs(d) > Math.abs(deltas[best.code])) {
      best = { code, delta: d };
    }
  }
  if (!best) return null;
  const rank = best.delta > 0 ? "strength_short" : "weakness_short";
  return { code: best.code, rank };
}

// Returns the element moving counter to engagement direction, or null
function pickCounterFactor(status, direction) {
  const SHORT_MIN_DELTA = 2.0;
  const deltas = { V: Number(status.V_delta_1), D: Number(status.D_delta_1), A: Number(status.A_delta_1) };
  let best = null;
  for (const code of ["V", "D", "A"]) {
    const d = deltas[code];
    if (!Number.isFinite(d)) continue;
    if (direction === "positive" && d >= 0) continue;
    if (direction === "negative" && d <= 0) continue;
    if (Math.abs(d) < SHORT_MIN_DELTA) continue;
    if (best === null || Math.abs(d) > Math.abs(deltas[best.code])) {
      best = { code, delta: d };
    }
  }
  if (!best) return null;
  const rank = best.delta > 0 ? "strength_short" : "weakness_short";
  return { code: best.code, rank };
}

// Mid-term primary factor by 6-month slope when short-term delta is insufficient
// Returns { code: "V"|"D"|"A", rank: "strength_mid"|"weakness_mid" } or null
function pickPrimaryFactorMid(status, direction) {
  const MIN_SLOPE_POS = 0.20;
  const MIN_SLOPE_NEG = -0.20;
  const slopes = {
    V: Number(status.V_slope_6),
    D: Number(status.D_slope_6),
    A: Number(status.A_slope_6),
  };
  let best = null;
  for (const code of ["V", "D", "A"]) {
    const s = slopes[code];
    if (!Number.isFinite(s)) continue;
    if (direction === "positive" && s <= MIN_SLOPE_POS) continue;
    if (direction === "negative" && s >= MIN_SLOPE_NEG) continue;
    if (best === null || Math.abs(s) > Math.abs(slopes[best.code])) {
      best = { code, slope: s };
    }
  }
  if (!best) return null;
  const rank = best.slope > 0 ? "strength_mid" : "weakness_mid";
  return { code: best.code, rank };
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
