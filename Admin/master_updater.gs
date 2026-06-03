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
  const flagConstant6mMap = computeFlagConstant6mMap(year, month);
  const masterData = {
    ratings: [],
    ratings2: [],
    evaluations: []
  };
  ratingsData.forEach(rating => {
    rating.flag_constant_6m = flagConstant6mMap[rating.address] || "";
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

  // Update member's attributes on Comment sheet that aren't written.
  console.log("Updating user attributes on comment sheet...");
  updateCommentAttribute(year, month);  // Member's attributes in Comment sheet should be written.
  const commentData = getCommentData(year, month);
  console.log("Adding to master comment sheet...");
  addToMasterCommentSheet(commentData);
  console.log(`${commentData.length} records in comment sheet`);

  // Update organization attributes in all the master sheets
  console.log("Updating organization attributes on all master sheets...");
  updateOrganizationData(memberList);

  // Update person_master sheet in EngagementMasterSS
  console.log("Updating person_master sheet...");
  updatePersonMasterSheet();
}