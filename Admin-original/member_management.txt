function getMemberList() {
  return MemberSheet.getDataRange().getValues().slice(1).map(row => ({
    id: row[0],
    name: row[ColumnMemberName],
    kana: row[ColumnMemberKana],
    alternativeName: row[ColumnMemberAlternativeName],
    address: row[ColumnMemberAddress],
    section: row[ColumnMemberSection],
    group: row[ColumnMemberGroup],
    project: row[ColumnMemberProject],
    grade: row[ColumnMemberGrade],
    leave: row[ColumnMemberLeave]
  }));
}

function updateOrganizationData(memberList) {
  const columnMap1 = {
    address: ColumnAddress,
    name: ColumnMasterName,
    section: ColumnMasterCurrentSection,
    group: ColumnMasterCurrentGroup,
    project: ColumnMasterCurrentProject,
    grade: ColumnMasterGrade
  };
  const columnMap2 = {
    address: ColumnMaster2Address,
    name: ColumnMaster2Name,
    section: ColumnMaster2Section,
    group: ColumnMaster2Group,
    project: ColumnMaster2Project,
    grade: ColumnMaster2Grade
  };

  updateAttributes(RatingMasterSheet, memberList, columnMap1);
  updateAttributes(EvaluationMasterSheet, memberList, columnMap1);
  updateAttributes(CommentMasterSheet, memberList, columnMap1);
  updateAttributes(RatingMasterSheet2, memberList, columnMap2);
  updateAttributes(RatingMasterSheet3, memberList, columnMap2);
}

function updateAttributes(sheet, memberList, columnMap) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const updatedRows = [];			// data to be updated
  const updatedRowIndices = [];		// row number of the sheet

  rows.forEach((row, i) => {
    const member = memberList.find(m => m.address === row[columnMap.address]);
    const rowIndex = i + 1;			// 0-based -> 1-based to ignore header

    const rowUpdated = [...row];
    let isDiff = false;

    if (member) {
      if (member.leave === "Y") {
        rowUpdated[columnMap.section] = "";
        rowUpdated[columnMap.group] = "";
        rowUpdated[columnMap.project] = "";
        rowUpdated[columnMap.grade] = "";
        updatedRows.push(rowUpdated);
        updatedRowIndices.push(rowIndex);
      } else {
      	// check whether there is a difference
        if (row[columnMap.name] !== member.name) {
          rowUpdated[columnMap.name] = member.name;
          isDiff = true;
        }
        if (row[columnMap.section] !== member.section) {
          rowUpdated[columnMap.section] = member.section;
          isDiff = true;
        }
        if (row[columnMap.group] !== member.group) {
          rowUpdated[columnMap.group] = member.group;
          isDiff = true;
        }
        if (row[columnMap.project] !== member.project) {
          rowUpdated[columnMap.project] = member.project;
          isDiff = true;
        }
        if (row[columnMap.grade] !== member.grade) {
          rowUpdated[columnMap.grade] = member.grade;
          isDiff = true;
        }
        if (isDiff) {
          updatedRows.push(rowUpdated);
          updatedRowIndices.push(rowIndex);
        }
      }
    } else {
      // clear comulmns if member does not exist
      if (row[columnMap.section] !== "" || row[columnMap.group] !== "" || row[columnMap.project] !== "" || row[columnMap.grade] !== "") {
        rowUpdated[columnMap.section] = "";
        rowUpdated[columnMap.group] = "";
        rowUpdated[columnMap.project] = "";
        rowUpdated[columnMap.grade] = "";
        updatedRows.push(rowUpdated);
        updatedRowIndices.push(rowIndex);
      }
    }
  });

  updatedRowIndices.forEach((rowIdx, i) => {
    sheet.getRange(rowIdx + 1, 1, 1, headers.length).setValues([updatedRows[i]]);
  });
}
