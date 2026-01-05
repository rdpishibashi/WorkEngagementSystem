//
// Create a spreadsheet for the individual incorporating the recorded engagement data.
//

const BASE_INDIVIDUAL_HEADER = [
  "year", "month", "day", "date", "mail address",
  "engagement", "vigor", "dedication", "absorption"
];

const RESULT_HEADER_FALLBACK = [
  "level", "trend_base", "trend_recent", "trend_refined",
  "change_tag", "stability", "strength_short", "weakness_short",
  "strength_mid", "weakness_mid",
  "E_delta_1", "E_delta_1_prev", "E_delta_1_std_6",
  "E_slope_6", "E_slope_6_std_6",
  "V_delta_1", "D_delta_1", "A_delta_1",
  "V_slope_6", "D_slope_6", "A_slope_6"
];

const RESULT_START_COLUMN = BASE_INDIVIDUAL_HEADER.length + 1; // Column J
var LastIndividualData = [];

function makeIndividualSheet(address, name, responseDate, period, ratingRowNumber = null) {
  const ratings = RatingSheet.getDataRange().getValues();
  const dataRows = ratings.slice(1);  // Skip header row
  const userRatings = dataRows.filter(rating => rating[Address] === address);

  if (!IndividualSheet) {
    IndividualSheet = RatingSS.insertSheet(name);
  } else {
    const lastRow = IndividualSheet.getLastRow();
    if (lastRow > 1) {
      IndividualSheet.deleteRows(2, lastRow - 1); // delete all old data except for the title row
    }
  }

  ensureIndividualHeader(IndividualSheet);

  let startDate = DateUtil.getMonthsOffsetDate(setResponseDate(responseDate), -period + 1);
  startDate = DateUtil.getMonthFirstDate(startDate);
  const individualData = userRatings.filter(rating =>
    rating[DateLabel] instanceof Date && setResponseDate(rating[DateLabel]) >= startDate
  );

  if (!individualData.length) {
    LastIndividualData = [];
    return {};
  }

  IndividualSheet.getRange(2, 1, individualData.length, individualData[0].length).setValues(individualData);

  const fields = getResultHeaders();
  const blankResults = fields.map(() => "");
  const analyzeInput = [BASE_INDIVIDUAL_HEADER].concat(individualData);
  const engagementStatus = analyzeEngagement(analyzeInput) || {};
  let valuesRow = blankResults;

  if (Object.keys(engagementStatus).length) {
    valuesRow = fields.map(field =>
      engagementStatus[field] !== undefined ? engagementStatus[field] : ""
    );

    ensureResultHeaders(RatingSheet);
    const lastRow = IndividualSheet.getLastRow();
    IndividualSheet.getRange(lastRow, RESULT_START_COLUMN, 1, valuesRow.length).setValues([valuesRow]);

    // Use the provided row number if available (from recordEngagement), otherwise fall back to getLastRow()
    // This prevents race conditions when multiple submissions occur concurrently
    const targetRowInRatingSheet = ratingRowNumber !== null ? ratingRowNumber : RatingSheet.getLastRow();
    RatingSheet.getRange(targetRowInRatingSheet, RESULT_START_COLUMN, 1, valuesRow.length).setValues([valuesRow]);
  }

  const rowsForCache = individualData.map((row, idx) =>
    row.concat(idx === individualData.length - 1 ? valuesRow : blankResults)
  );
  LastIndividualData = [getIndividualHeader()].concat(rowsForCache);

  return engagementStatus;
}

function ensureIndividualHeader(sheet) {
  const header = getIndividualHeader();
  ensureColumnCapacity(sheet, header.length);
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
}

function getIndividualHeader() {
  return BASE_INDIVIDUAL_HEADER.concat(getResultHeaders());
}

function getResultHeaders() {
  if (typeof ENGAGEMENT_RESULT_FIELDS !== "undefined" &&
      Array.isArray(ENGAGEMENT_RESULT_FIELDS) &&
      ENGAGEMENT_RESULT_FIELDS.length) {
    return ENGAGEMENT_RESULT_FIELDS;
  }
  return RESULT_HEADER_FALLBACK;
}

function ensureResultHeaders(sheet) {
  const resultHeaders = getResultHeaders();
  const requiredColumns = RESULT_START_COLUMN + resultHeaders.length - 1;
  ensureColumnCapacity(sheet, requiredColumns);
  sheet.getRange(1, RESULT_START_COLUMN, 1, resultHeaders.length).setValues([resultHeaders]);
}

function ensureColumnCapacity(sheet, requiredColumns) {
  const maxColumns = sheet.getMaxColumns();
  if (requiredColumns > maxColumns) {
    sheet.insertColumnsAfter(maxColumns, requiredColumns - maxColumns);
  }
}
