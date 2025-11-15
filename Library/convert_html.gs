/**
 * ConvertHtml Library - 改行・空行・画像配置改善版
 * 
 * 改善ポイント:
 * - 改行処理: タグ保護、空行可視化（spacerクラス）
 * - 画像展開: 1行タグ、標準block表示（align属性等のOutlook特化は削除）
 * - CSS余白: 見出し・段落・HRのマージンを調整
 * - リンク正規表現を正常化
 */

const HtmlEmailConfig = {
  lineBreakMode: 'markdown',
  markdownSettings: {
    boldRed: '**',
    boldBlack: '__',
    enableTables: true,
    enableLists: true,
    enableBlockquotes: true,
  },
  styles: {
    body:
      'font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;',
    section: 'margin-bottom: 20px;',
		h1: 'color: #333333; border-bottom: 1px solid #333333; padding-bottom: 4px; font-size: 24px; margin: 16px 0 8px 0; mso-margin-bottom-alt:0;',
		h2: 'color: #333333; border-bottom: 1px solid #333333; padding-bottom: 3px; font-size: 22px; margin: 14px 0 6px 0; mso-margin-bottom-alt:0;',
		h3: 'color: #333333; font-size: 20px; margin: 10px 0 4px 0; mso-margin-bottom-alt:0;',
		h4: 'color: #333333; font-size: 18px; margin: 8px 0 3px 0;  mso-margin-bottom-alt:0;',
		h5: 'color: #333333; font-size: 16px; margin: 6px 0 2px 0;  mso-margin-bottom-alt:0;',
		h6: 'color: #333333; font-size: 14px; margin: 6px 0 2px 0;  mso-margin-bottom-alt:0;',
    emphasis: 'font-weight: bold;',
    emphasisRed: 'font-weight: bold; color: #FF0000;',
    emphasisBlack: 'font-weight: bold; color: #000000;',
    link: 'color: #0066cc; text-decoration: none;',
    blockquote:
      'border-left: 4px solid #ddd; margin: 0 0 15px 0; padding: 10px 15px; background-color: #f9f9f9; color: #666;',
    code:
      'background-color: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 90%;',
    codeBlock:
      'background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 5px; padding: 15px; font-family: monospace; font-size: 90%; overflow-x: auto; margin: 15px 0;',
    table: 'border-collapse: collapse; width: 100%; margin: 15px 0;',
    tableHeader:
      'background-color: #f5f5f5; border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: bold;',
    tableCell: 'border: 1px solid #ddd; padding: 12px; text-align: left;',
    list: 'margin: 10px 0; padding-left: 20px;',
    listItem: 'margin: 5px 0;',
    spacer: 'height: 1em; line-height: 1em; margin: 0;',
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateCSS(styles) {
  return (
    'body { ' +
    styles.body +
    ' }\n' +
    '.section { ' +
    styles.section +
    ' }\n' +
    'h1 { ' +
    styles.h1 +
    ' }\n' +
    'h2 { ' +
    styles.h2 +
    ' }\n' +
    'h3 { ' +
    styles.h3 +
    ' }\n' +
    'h4 { ' +
    styles.h4 +
    ' }\n' +
    'h5 { ' +
    styles.h5 +
    ' }\n' +
    'h6 { ' +
    styles.h6 +
    ' }\n' +
    '.emphasis { ' +
    styles.emphasis +
    ' }\n' +
    '.emphasis-red { ' +
    styles.emphasisRed +
    ' }\n' +
    '.emphasis-black { ' +
    styles.emphasisBlack +
    ' }\n' +
    '.link { ' +
    styles.link +
    ' }\n' +
    'p { margin: 0 0 10px 0; mso-margin-top-alt:0; mso-margin-bottom-alt:10px; }\n' +
    'code { ' +
    styles.code +
    ' }\n' +
    'pre { ' +
    styles.codeBlock +
    ' }\n' +
    'pre code { background: none; padding: 0; border-radius: 0; }\n' +
    'blockquote { ' +
    styles.blockquote +
    ' }\n' +
    'ul, ol { ' +
    styles.list +
    ' }\n' +
    'li { ' +
    styles.listItem +
    ' }\n' +
    'table { ' +
    styles.table +
    ' }\n' +
    'th { ' +
    styles.tableHeader +
    ' }\n' +
    'td { ' +
    styles.tableCell +
    ' }\n' +
    'hr { border: none; border-top: 1px solid #ddd; margin: 10px 0; }\n' +
    'img { max-width: 100%; height: auto; display: block; margin: 8px 0; }\n' +
    '.spacer { ' +
    styles.spacer +
    ' }\n' +
    'del { color: #888; text-decoration: line-through; }\n' +
    'em { font-style: italic; }'
  );
}

function generateHtmlDocument(content, config) {
  const css = generateCSS(config.styles);
  return (
    '<!DOCTYPE html>\n<html>\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
    content +
    '\n</body>\n</html>'
  );
}

function processTemplate(template, replacements, charts, inlineImages, config) {
  let processedTemplate = replacePlaceholders(template, replacements);
  processedTemplate = replaceChartPlaceholders(processedTemplate, charts);
  processedTemplate = replaceImagePlaceholders(processedTemplate, inlineImages);
  processedTemplate = applyMarkdownFormatting(processedTemplate, config);
  return processedTemplate;
}

function replacePlaceholders(template, replacements) {
  let result = template;
  for (const [key, value] of Object.entries(replacements || {})) {
    const regex = new RegExp(`{{${escapeRegex(key)}}}`, 'g');
    result = result.replace(regex, escapeHtml(String(value)));
  }
  return result;
}

function replaceChartPlaceholders(template, charts) {
  let result = template;
  (charts || []).forEach((chart, index) => {
    const regex = new RegExp(`{{graph:${escapeRegex(chart.title)}}}`, 'g');
    result = result.replace(
      regex,
      `<img src="cid:graph${index + 1}" alt="${escapeHtml(chart.title)}" style="display:block;margin:8px 0;max-width:100%;height:auto;">`
    );
  });
  return result;
}

function replaceImagePlaceholders(template, inlineImages) {
  let result = template;
  let imageIndex = 1;
  for (const [key] of Object.entries(inlineImages || {})) {
    const regex = new RegExp(`{{image:${escapeRegex(key)}}}`, 'g');
    result = result.replace(
      regex,
      `<img src="cid:image${imageIndex}" alt="${escapeHtml(key)}" style="display:block;margin:8px 0;max-width:100%;height:auto;">`
    );
    imageIndex++;
  }
  return result;
}

function applyMarkdownFormatting(content, config) {
  let processedContent = processBlockElements(content, config);
  processedContent = applyInlineFormatting(processedContent);
  processedContent = handleLineBreaks(processedContent);
  return processedContent;
}

function processBlockElements(content, config) {
  const lines = content.split('\n');
  const processedLines = [];
  let i = 0;
  while (i < lines.length) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.match(/^#{1,6}\s+/)) {
      processedLines.push(processHeading(trimmedLine));
      i++;
      continue;
    }
    if (trimmedLine.startsWith('```')) {
      const [block, next] = processCodeBlock(lines, i);
      processedLines.push(block);
      i = next;
      continue;
    }
    if (trimmedLine.startsWith('> ')) {
      const [bq, next] = processBlockquote(lines, i);
      processedLines.push(bq);
      i = next;
      continue;
    }
    if (trimmedLine.includes('|') && isTableRow(trimmedLine)) {
      const [table, next] = processTable(lines, i, config);
      processedLines.push(table);
      i = next;
      continue;
    }
    if (trimmedLine.match(/^[\-\*\+]\s+/) || trimmedLine.match(/^\d+\.\s+/)) {
      const [list, next] = processList(lines, i);
      processedLines.push(list);
      i = next;
      continue;
    }
    if (trimmedLine.match(/^-{3,}$/) || trimmedLine.match(/^\*{3,}$/)) {
      processedLines.push('<hr>');
      i++;
      continue;
    }
    processedLines.push(lines[i]);
    i++;
  }
  return processedLines.join('\n');
}

function processHeading(line) {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return line;
  const level = match[1].length;
  let text = match[2].trim();
  // 見出し行の最初の数字部分を有効化する（u200B はゼロ幅スペース）
  text = text.replace(/^(\d+)\.\s+/, (_m, n) => n + '\u200B' + '. ');
  return `<h${level}>${escapeHtml(text)}</h${level}>`;
}

function processCodeBlock(lines, startIndex) {
  const codeLines = [];
  let i = startIndex + 1;
  const firstLine = lines[startIndex].trim();
  const language = firstLine.length > 3 ? firstLine.substring(3).trim() : '';
  while (i < lines.length && !lines[i].trim().startsWith('```')) {
    codeLines.push(escapeHtml(lines[i]));
    i++;
  }
  const cls = language ? ` class="language-${language}"` : '';
  return [`<pre${cls}><code>${codeLines.join('\n')}</code></pre>`, i + 1];
}

function processBlockquote(lines, startIndex) {
  const quoteLines = [];
  let i = startIndex;
  while (i < lines.length && lines[i].trim().startsWith('> ')) {
    quoteLines.push(lines[i].trim().substring(2));
    i++;
  }
  return [`<blockquote>${quoteLines.join('<br>')}</blockquote>`, i];
}

function processTable(lines, startIndex, config) {
  if (!config.markdownSettings.enableTables) return [lines[startIndex], startIndex + 1];
  const rows = [];
  let i = startIndex;
  let header = true;
  while (i < lines.length && isTableRow(lines[i].trim())) {
    const row = lines[i].trim();
    if (row.match(/^\|[\s\-\|:]+\|$/)) { i++; continue; }
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    const tag = header ? 'th' : 'td';
    const processedCells = cells.map(c => `<${tag}>${applyInlineFormatting(c)}</${tag}>`).join('');
    rows.push(`<tr>${processedCells}</tr>`);
    header = false;
    i++;
  }
  return [`<table>\n${rows.join('\n')}\n</table>`, i];
}

function processList(lines, startIndex) {
  const items = [];
  let i = startIndex;
  const ordered = !!lines[i].trim().match(/^\d+\.\s+/);
  const tag = ordered ? 'ol' : 'ul';
  while (i < lines.length) {
    const m = lines[i].trim().match(/^[\-\*\+]\s+(.+)$/) || lines[i].trim().match(/^\d+\.\s+(.+)$/);
    if (!m) break;
    items.push(`<li>${m[1]}</li>`);
    i++;
  }
  return [`<${tag}>\n${items.join('\n')}\n</${tag}>`, i];
}

function isTableRow(line) {
  return line.startsWith('|') && line.endsWith('|') && line.includes('|');
}

function applyInlineFormatting(content) {
  let result = content;
  result = result.replace(/\*\*([^<>]+?)\*\*/g, '<span class="emphasis-red">$1</span>');
  result = result.replace(/__([^<>]+?)__/g, '<span class="emphasis-black">$1</span>');
  result = result.replace(/(^|[^*])\*([^*<>\n]+?)\*([^*]|$)/g, '$1<em>$2</em>$3');
  result = result.replace(/(^|[^_])_([^_<>\n]+?)_([^_]|$)/g, '$1<em>$2</em>$3');
  result = result.replace(/~~([^<>]+?)~~/g, '<del>$1</del>');
  result = result.replace(/`([^`<>]+?)`/g, (_m, c) => '<code>' + escapeHtml(c) + '</code>');
  result = result.replace(/$begin:math:display$([^$end:math:display$<>]+?)\]$begin:math:text$([^)<>]+?)$end:math:text$/g, '<a href="$2" class="link">$1</a>');
  result = result.replace(/(^|[^"'>=])https?:\/\/[^\s<>]+/g, (m, p) => {
    const url = m.substring(p.length);
    return p + '<a href="' + url + '" class="link">' + url + '</a>';
  });
  return result;
}

function handleLineBreaks(content) {
  return handleStandardMarkdownLineBreaks(content);
}

function handleStandardMarkdownLineBreaks(content) {
  // 改行コードをLFに正規化（CRLF/CR → LF）
  content = content.replace(/\r\n?/g, '\n');

  // タグ内改行をスペースに変換（タグ破断防止）
  content = content.replace(/<[^>]*\n[^>]*>/g, m => m.replace(/\n+/g, ' '));
  const BLOCK_PATTERN = /(<(?:div|h[1-6]|pre|blockquote|table|ul|ol)[\s\S]*?<\/(?:div|h[1-6]|pre|blockquote|table|ul|ol)>|<(?:hr|img)[^>]*>)/gi;
	const segments = content.split(BLOCK_PATTERN);
	const processed = segments.map(seg => {
	  if (!seg) return '';
	  const t = seg.trim();
	  // ブロック要素のみ未処理で返す（インラインは処理する）
	  const isProtectedBlock = /^<(?:div|h[1-6]|pre|blockquote|table|ul|ol|hr|img)\b/i.test(t);
	  if (isProtectedBlock) return seg;
	
	  // ここからはテキスト or インライン要素混在を“本文”として処理
	  // 2スペ＋改行 → <br>（※末尾に \n を入れない）
	  let s = seg.replace(/  \r?\n/g, '<br>');
	  // 空行（\n\n...） → 段落区切り（※\n を入れない）
	  s = s.replace(/\r?\n{2,}/g, (m) => {
	    const count = (m.match(/\n/g) || []).length;
	    return '</p>' + '<p class="spacer">&nbsp;</p>'.repeat(count - 1) + '<p>';
	  });

	  // 単一改行 → <br>（※末尾に \n を入れない）
	  s = s.replace(/\r?\n/g, '<br>');
	  if (!/^\s*$/.test(s)) s = `<p>${s}</p>`;

	  return s;
	});

  return processed.join('');
}

function createHtmlEmail(templateMd, replacements, charts, inlineImages, config) {
  const cfg = config || HtmlEmailConfig;
  const htmlBody = processTemplate(templateMd, replacements, charts, inlineImages, cfg);
  return generateHtmlDocument(htmlBody, cfg);
}

/**
 * メールテンプレートを取得
 */
function getMailTemplate(messageType, messageSS) {
  try {
    const mailMessageSheet = messageSS.getSheetByName("mail");
    if (!mailMessageSheet) {
      throw new Error("'mail' sheet not found");
    }
    
    const [headerRow, ...mailMessages] = mailMessageSheet.getDataRange().getValues();
    const functionIndex = headerRow.indexOf("function");
    const messageIndex = headerRow.indexOf("message");
    
    if (functionIndex === -1 || messageIndex === -1) {
      throw new Error("Required columns 'function' or 'message' not found");
    }

    const message = mailMessages.find(row => row[functionIndex] === messageType);
    if (!message) {
      throw new Error(`Mail template for '${messageType}' not found`);
    }
    
    return message[messageIndex];
  } catch (error) {
    console.error("Error getting mail template:", error);
    throw error;
  }
}