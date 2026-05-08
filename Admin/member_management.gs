function getMemberList() {
  return MemberSheet.getDataRange().getValues().slice(1).map(row => ({
    id: row[0],
    name: row[ColumnMemberName],
    kana: row[ColumnMemberKana],
    alternativeName: row[ColumnMemberAlternativeName],
    address: row[ColumnMemberAddress],
    division: row[ColumnMemberDivision],
    department: row[ColumnMemberDepartment],
    section: row[ColumnMemberSection],
    team: row[ColumnMemberTeam],
    project: row[ColumnMemberProject],
    grade: row[ColumnMemberGrade],
    leave: row[ColumnMemberLeave]
  }));
}

function updateOrganizationData(memberList) {
  // All master sheets now use the same common column indices for year to grade
  const columnMap = {
    address: ColumnAddress,
    name: ColumnName,
    division: ColumnCurrentDivision,
    department: ColumnCurrentDepartment,
    section: ColumnCurrentSection,
    team: ColumnCurrentTeam,
    project: ColumnCurrentProject,
    grade: ColumnGrade
  };

  updateAttributes(RatingMasterSheet, memberList, columnMap);
  updateAttributes(RatingMasterSheet2, memberList, columnMap);
  updateAttributes(EvaluationMasterSheet, memberList, columnMap);
  updateAttributes(CommentMasterSheet, memberList, columnMap);

  // EngagementMasterAll sheets (same column layout as EngagementMasterSS)
  updateAttributes(RatingMasterAllSheet2, memberList, columnMap);
  updateAttributes(CommentMasterAllSheet, memberList, columnMap);
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
      if (member.leave === "leave") {
        // Retired or transferred out — clear all current organization fields
        rowUpdated[columnMap.division] = "";
        rowUpdated[columnMap.department] = "";
        rowUpdated[columnMap.section] = "";
        rowUpdated[columnMap.team] = "";
        rowUpdated[columnMap.project] = "";
        rowUpdated[columnMap.grade] = "";
        updatedRows.push(rowUpdated);
        updatedRowIndices.push(rowIndex);
      } else {
        // Active or absence — update current organization fields from MemberSS
      	// check whether there is a difference
        const displayName = member.alternativeName || member.name;
        if (row[columnMap.name] !== displayName) {
          rowUpdated[columnMap.name] = displayName;
          isDiff = true;
        }
        if (row[columnMap.division] !== member.division) {
          rowUpdated[columnMap.division] = member.division;
          isDiff = true;
        }
        if (row[columnMap.department] !== member.department) {
          rowUpdated[columnMap.department] = member.department;
          isDiff = true;
        }
        if (row[columnMap.section] !== member.section) {
          rowUpdated[columnMap.section] = member.section;
          isDiff = true;
        }
        if (row[columnMap.team] !== member.team) {
          rowUpdated[columnMap.team] = member.team;
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
      if (row[columnMap.division] !== "" || row[columnMap.department] !== "" || row[columnMap.section] !== "" || row[columnMap.team] !== "" || row[columnMap.project] !== "" || row[columnMap.grade] !== "") {
        rowUpdated[columnMap.division] = "";
        rowUpdated[columnMap.department] = "";
        rowUpdated[columnMap.section] = "";
        rowUpdated[columnMap.team] = "";
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