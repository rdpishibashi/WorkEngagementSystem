function updateMaster() {
  let { year, month } = getCurrentDayParts(new Date());
  if (month === 1) {   // Measurement is done in previous month
    month = 12;
    year--;
  } else
    month--;

  const memberList = getMemberList();

  const ratingsData = getRatingsData(year, month);
  const masterData = {
    ratings: [],
    ratings2: [],
    ratings3: [],
    evaluations: []
  };
  ratingsData.forEach(rating => {
    const member = memberList.find(m => m.address === rating.address);
    if (member) {
      createMasterDataToBeAdded(masterData, rating, member);
    }
  });
  addToMasterRatingSheets(masterData);

  const commentData = getCommentData(year, month);
  // Update member's attributes on Comment sheet that aren't written.
  console.log("Updating user attributes on comment sheet...");
  updateCommentAttribute(year, month);  // Member's attributes in Comment sheet should be written.
  console.log("Creating master comment...");
  addToMasterCommentSheet(commentData);

  // Update organization attributes in all the master sheets
  console.log("Updating user attributes on master comment sheet...");
  updateOrganizationData(memberList);
}