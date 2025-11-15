//
// Retrieve the current season's greeting from its sheet.
//
function getSeasonalGreeting(month) {
  let greetings = GreetingSheet.getDataRange().getValues(); 
  let headerRow = greetings.shift();
  let monthIndex = headerRow.indexOf("month");
  let greetingIndex = headerRow.indexOf("seasonal greeting"); 
  var filteredData = greetings.filter(function(row) {
    return row[monthIndex] === month;
  });

  let randomIndex = Math.floor(Math.random() * filteredData.length);
  let randomRow = filteredData[randomIndex];

  let greeting = randomRow[greetingIndex]; 
  
  return greeting;
}

//
// Retrieve the message from its sheet.
//
function getMessage(month) {
  const messages = MessageSheet.getDataRange().getValues(); 
  const headerRow = messages.shift();
  const sequenceIndex = headerRow.indexOf("sequence");
  const messageIndex = headerRow.indexOf("message"); 
  const messageCount = messages.length;   // excluding header row

  const targetSequence = (month % messageCount) + 1;

  for (let i = 0; i < messageCount; i++) {
    if (messages[i][sequenceIndex] === targetSequence) {
      return messages[i][messageIndex];
    }
  }
}

//
// Retrieve a note that describes positive psychology from its sheet.
//
function getColumn(sequenceNumber) {
  const [headerRow, ...notes] = ColumnSheet.getDataRange().getValues();
  const sequenceIndex = headerRow.indexOf("sequence");
  const noteIndex = headerRow.indexOf("wellbeing");

  const note = notes.find(row => row[sequenceIndex] === sequenceNumber);
  return note ? note[noteIndex] : "今回はお休みです。";
}

//
// Retrieve a well-known quotation related to a person's engagement status.
//
function getQuote(engagementStatus) {
  const negativeEngagementFactors = getNegativeEngagementFactor(engagementStatus);
  const quote = getSaying(negativeEngagementFactors);
  return `${quote.saying}—— ${quote.speaker}`;
}
