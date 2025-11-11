//
// Create a trend chart for the individual's engagement.
//
function individualEngagementChart(plotData) {
  const data = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, "Date")
    .addColumn(Charts.ColumnType.NUMBER, "ワークエンゲージメント");

  plotData.slice(1).forEach(row => {
    const dateString = `${row[Year]}-${row[Month]}`;
//    const monday = DateUtil.getMondayOfWeek(plotData[i][colDate - 1]);   // for weekly operation
//    const dateString = Utilities.formatDate(monday, Session.getScriptTimeZone(), 'yyyy-MM-dd');   // for weekly operation
    data.addRow([dateString, row[Engagement] / MaxValueEngagement * MaxScale]);
  });
  data.build();
  
  return Charts.newColumnChart()
    .setDataTable(data)
    .setTitle("ワークエンゲージメント (最大値 10)")
    .setDimensions(200 + plotData.length * 50, 350)
    .setRange(0, 10)
    .setOption('legend.position', 'none')
    .setOption('vAxis', {
      title: 'ワークエンゲージメント値',
      viewWindow: {
        min: 0,
        max: 10
      }
    })
    .setOption('fileName', 'engagement_trend.png')
    .build();
}

//
// Create a trend chart of engagement variations for the individual.
//
function individualEngagementVariationChart(plotData) {
  const data = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, "Date")
    .addColumn(Charts.ColumnType.NUMBER, "ワークエンゲージメント増減");

  const minBoundary = 4;
  let minValue = Infinity;
  let maxValue = -Infinity;

  if (plotData.length >= 3) {
    // 十分なデータがある場合、実際のデータを追加
    plotData.slice(1, -1).forEach((row, i) => {
      const dateString = `${plotData[i + 2][Year]}-${plotData[i + 2][Month]}`;
//      const monday = DateUtil.getMondayOfWeek(plotData[i][colDate - 1]);   // for weekly operation
//      const dateString = Utilities.formatDate(monday, Session.getScriptTimeZone(), 'yyyy-MM-dd');   // for weekly operation
      const variation = (plotData[i + 2][Engagement] - row[Engagement]) / MaxValueEngagement * MaxScale;

      // 最小値と最大値を更新
      minValue = Math.min(minValue, variation);
      maxValue = Math.max(maxValue, variation);

      data.addRow([dateString, variation]);
    });
  } else {
    // データが不足している場合、ダミーデータを追加
    data.addRow(["none", 0]);
  }

  data.build();

  let chartBuilder;

  if (plotData.length >= 3) {
    chartBuilder = Charts.newLineChart()
      .setTitle("ワークエンゲージメント増減");
  } else {
    chartBuilder = Charts.newColumnChart()
      .setTitle("データが不足しています");
  }

  // Y軸の設定
  let vAxisOptions;
  if (minValue >= -minBoundary && maxValue <= minBoundary) {
    // ±3未満なら固定スケール
    vAxisOptions = {
      title: '増減値',
      viewWindow: {
        min: -minBoundary,
        max: minBoundary
      }
    };
  } else {
    // ±3以上ならオートスケール
    vAxisOptions = {
      title: '増減値'
    };
  }

  chartBuilder
    .setDataTable(data)
    .setDimensions(200 + plotData.length * 50, 350)
    .setRange(0, 10)
    .setOption('legend', { position: 'none' })
    .setOption('vAxis', vAxisOptions);

  return chartBuilder.build();
}

//
// Create a trend chart for the individual based on the engagement factors.
//
function individualEngagementElementsChart(plotData, lastRow) {
  const data = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, "Date")
    .addColumn(Charts.ColumnType.NUMBER, "活力") // Vigor
    .addColumn(Charts.ColumnType.NUMBER, "熱意") // Dedication
    .addColumn(Charts.ColumnType.NUMBER, "没頭"); // Absorption

  plotData.slice(1).forEach(row => {
    const dateString = `${row[Year]}-${row[Month]}`;
//    const monday = DateUtil.getMondayOfWeek(plotData[i][colDate - 1]);   // for weekly operation
//    const dateString = Utilities.formatDate(monday, Session.getScriptTimeZone(), 'yyyy-MM-dd');   // for weekly operation
    const vigor = row[Vigor] / MaxValueEngagementFactor * MaxScale;
    const dedication = row[Dedication] / MaxValueEngagementFactor * MaxScale;
    const absorption = row[Absorption] / MaxValueEngagementFactor * MaxScale;
    data.addRow([dateString, vigor, dedication, absorption]);
  });

  data.build();

  return Charts.newLineChart()
    .setDataTable(data)
    .setTitle("ワークエンゲージメント構成要素（最大値 10）")
    .setDimensions(200 + plotData.length * 50, 350)
    .setRange(0, 10)
    .setPointStyle(Charts.PointStyle.MEDIUM)
    .setColors(["#FF9900", "#FF0066", "#009933"])
    .setOption('legend.position', 'top')
    .setOption('vAxis', {
      title: '構成要素値',
      viewWindow: {
        min: 0,
        max: 10
      }
    })
    .setOption('fileName', 'engagement_factor.png')
    .setOption('pointSize', 5)
    .build();
}
