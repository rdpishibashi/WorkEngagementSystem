//
// Record the user's input data and comments without any processing
// into the "rating" and "comment" sheets.
//
function recordEngagement(address, responseDate, engagementData, concern, comment) {
  const recordDate = setResponseDate(responseDate);

  const ratingData = [
    [recordDate.getFullYear(), recordDate.getMonth() + 1, recordDate.getDate(), responseDate, address, 
     engagementData.engagement, engagementData.vigor, engagementData.dedication, engagementData.absorption]
  ];

  const lastRowOfRatingSheet = RatingSheet.getLastRow();
  RatingSheet.getRange(lastRowOfRatingSheet + 1, 1, 1, ratingData[0].length).setValues(ratingData);

  if (concern !== "" || comment !== "") {
    const commentData = [
      [recordDate.getFullYear(), recordDate.getMonth() + 1, recordDate.getDate(), responseDate, address, '', '', '', '', '', '', '', '', '', '', '', '', concern, comment]
    ];

    const lastRowOfCommentSheet = CommentSheet.getLastRow();
    CommentSheet.getRange(lastRowOfCommentSheet + 1, 1, 1, commentData[0].length).setValues(commentData);
  }

  return lastRowOfRatingSheet + 1;
}
