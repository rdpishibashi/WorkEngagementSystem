/**
 * Standalone test script for intervention_priority calculation
 * This can be run with Node.js to verify the logic before deploying to Google Apps Script
 *
 * Run with: node test_intervention_priority.js
 */

function calculateInterventionPriority(rating) {
  let score = 0;

  // trend_refined scores
  const trendRefinedScores = {
    "低下加速": 5,
    "低下危機": 4,
    "悪化": 3,
    "低下警戒": 2,
    "低下懸念": 1,
    "上昇加速": 1,
    "復活": 2,
    "回復": 3
  };

  const trendRefined = rating.trend_refined || "";
  score += trendRefinedScores[trendRefined] || 0;

  // trend_recent scores
  const trendRecentScores = {
    "急落": 2,
    "連続下降": 1
  };

  const trendRecent = rating.trend_recent || "";
  score += trendRecentScores[trendRecent] || 0;

  // change_tag scores
  const changeTag = rating.change_tag || "";
  if (changeTag === "変化大") {
    score += 1;
  }

  return score;
}

// Test cases
const tests = [
  {
    name: "Maximum priority (低下加速 + 急落 + 変化大)",
    input: {trend_refined: "低下加速", trend_recent: "急落", change_tag: "変化大"},
    expected: 8
  },
  {
    name: "High priority (低下危機)",
    input: {trend_refined: "低下危機", trend_recent: "", change_tag: ""},
    expected: 4
  },
  {
    name: "Zero priority (no matches)",
    input: {trend_refined: "", trend_recent: "", change_tag: ""},
    expected: 0
  },
  {
    name: "Mixed (復活 + 連続下降 + 変化大)",
    input: {trend_refined: "復活", trend_recent: "連続下降", change_tag: "変化大"},
    expected: 4
  },
  {
    name: "Medium-high (低下警戒 + 急落 + 変化大)",
    input: {trend_refined: "低下警戒", trend_recent: "急落", change_tag: "変化大"},
    expected: 5
  },
  {
    name: "Low (上昇加速 + 変化大)",
    input: {trend_refined: "上昇加速", trend_recent: "", change_tag: "変化大"},
    expected: 2
  },
  {
    name: "Single component (悪化)",
    input: {trend_refined: "悪化", trend_recent: "", change_tag: ""},
    expected: 3
  },
  {
    name: "Only trend_recent (急落)",
    input: {trend_refined: "", trend_recent: "急落", change_tag: ""},
    expected: 2
  },
  {
    name: "Only change_tag (変化大)",
    input: {trend_refined: "", trend_recent: "", change_tag: "変化大"},
    expected: 1
  },
  {
    name: "Undefined values",
    input: {trend_refined: undefined, trend_recent: undefined, change_tag: undefined},
    expected: 0
  }
];

console.log("=".repeat(70));
console.log("INTERVENTION PRIORITY CALCULATION TEST");
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

tests.forEach((test, idx) => {
  const result = calculateInterventionPriority(test.input);
  const isPass = result === test.expected;

  if (isPass) {
    passed++;
    console.log(`✓ Test ${idx + 1}: PASS - ${test.name}`);
  } else {
    failed++;
    console.log(`✗ Test ${idx + 1}: FAIL - ${test.name}`);
    console.log(`  Expected: ${test.expected}, Got: ${result}`);
  }

  console.log(`  Input: trend_refined="${test.input.trend_refined || ''}", trend_recent="${test.input.trend_recent || ''}", change_tag="${test.input.change_tag || ''}"`);
  console.log(`  Score: ${result}`);
  console.log();
});

console.log("=".repeat(70));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
console.log("=".repeat(70));

if (failed === 0) {
  console.log("✓ All tests passed! The calculation logic is correct.");
  process.exit(0);
} else {
  console.log("✗ Some tests failed. Please review the calculation logic.");
  process.exit(1);
}
