function getCommentData(year, month) {
  const commentData = CommentSheet.getDataRange().getValues();
  return commentData.slice(1).map(row => ({
    year: row[ColumnYear],
    month: row[ColumnMonth],
    day: row[ColumnDay],
    date: row[ColumnDate],
    address: row[ColumnCommentAddress],
    name: row[ColumnCommentName],
    division: row[ColumnCommentDivision],
    currentDivision: row[ColumnCommentCurrentDivision],
    department: row[ColumnCommentDepartment],
    currentDepartment: row[ColumnCommentCurrentDepartment],
    section: row[ColumnCommentSection],
    currentSection: row[ColumnCommentCurrentSection],
    team: row[ColumnCommentTeam],
    currentTeam: row[ColumnCommentCurrentTeam],
    project: row[ColumnCommentProject],
    currentProject: row[ColumnCommentCurrentProject],
    grade: row[ColumnCommentGrade],
    concern: row[ColumnCommentConcern],
    comment: row[ColumnCommentComment]
  })).filter(rating => rating.year === year && rating.month === month);
}

function updateCommentAttribute(year, month) {
  const commentSheet = CommentSheet;
  const commentData = commentSheet.getDataRange().getValues();
  const commentRows = commentData.slice(1); // ヘッダー除外

  const memberList = getMemberList();

  const updatedData = []; // 更新後の行データを格納
  const rowIndexes = [];  // 対象行インデックス（スプレッドシート上の行番号）

  commentRows.forEach((row, i) => {
    const rowYear = row[ColumnYear];
    const rowMonth = row[ColumnMonth];
    if (rowYear === year && rowMonth === month) {
      const address = row[ColumnCommentAddress];
      const member = memberList.find(m => m.address === address);

      if (member) {
        // 対象の行インデックスを記録
        rowIndexes.push(i + 2); // 2行目から開始するため

        // 必要なカラムだけ上書きしたデータを作成
        const updatedRow = [...row]; // 元データをコピー
        updatedRow[ColumnCommentName] = member.name;
        updatedRow[ColumnCommentDivision] = member.division;
        updatedRow[ColumnCommentCurrentDivision] = member.division;
        updatedRow[ColumnCommentDepartment] = member.department;
        updatedRow[ColumnCommentCurrentDepartment] = member.department;
        updatedRow[ColumnCommentSection] = member.section;
        updatedRow[ColumnCommentCurrentSection] = member.section;
        updatedRow[ColumnCommentTeam] = member.team;
        updatedRow[ColumnCommentCurrentTeam] = member.team;
        updatedRow[ColumnCommentProject] = member.project;
        updatedRow[ColumnCommentCurrentProject] = member.project;
        updatedRow[ColumnCommentGrade] = member.grade;

        updatedData.push(updatedRow);
      }
    }
  });

  // バッチで書き込み
  if (updatedData.length > 0) {
    rowIndexes.forEach((rowIndex, idx) => {
      const row = updatedData[idx];
      commentSheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    });
  }
}

function addToMasterCommentSheet(data) {
  // オブジェクトの配列を２次元配列に変換
  const values = data.map(obj => [
    obj.year,
    obj.month,
    obj.day,
    obj.date,
    obj.address,
    obj.name,
    obj.division,
    obj.currentDivision,
    obj.department,
    obj.currentDepartment,
    obj.section,
    obj.currentSection,
    obj.team,
    obj.currentTeam,
    obj.project,
    obj.currentProject,
    obj.grade,
    obj.concern,
    obj.comment
  ]);

//  console.log(values[0]); // values[0] は配列
//  console.log(values[0].length); // これで列数が取得できる

  if (values.length > 0) {
    CommentMasterSheet.getRange(CommentMasterSheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }
}
