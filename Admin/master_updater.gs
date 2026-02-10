function updateMaster() {
  let { year, month } = getCurrentDayParts(new Date());
  if (month === 1) {   // Measurement is done in previous month
    month = 12;
    year--;
  } else
    month--;
//  year= 2025;
//  month=12;
  console.log(year, month);

  const memberList = getMemberList();

  const ratingsData = getRatingsData(year, month);
  const masterData = {
    ratings: [],
    ratings2: [],
    evaluations: []
  };
  ratingsData.forEach(rating => {
    const member = memberList.find(m => m.address === rating.address);
    if (member) {
      createMasterDataToBeAdded(masterData, rating, member);
    }
  });

  console.log("Adding rating, rating2, and evaluation sheets...");
  addToMasterRatingSheets(masterData);
  console.log(`${masterData.ratings.length} records in rating sheet`);
  console.log(`${masterData.ratings2.length} records in rating2 sheet`);
  console.log(`${masterData.evaluations.length} records in evaluation sheet`);

  const commentData = getCommentData(year, month);
  // Update member's attributes on Comment sheet that aren't written.
  console.log("Updating user attributes on comment sheet...");
  updateCommentAttribute(year, month);  // Member's attributes in Comment sheet should be written.
  console.log("Adding to master comment sheet...");
  addToMasterCommentSheet(commentData);
  console.log(`${commentData.length} records in comment sheet`);

  // Update organization attributes in all the master sheets
  console.log("Updating user attributes on master comment sheet...");
  updateOrganizationData(memberList);
}