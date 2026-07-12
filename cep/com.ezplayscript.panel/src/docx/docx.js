'use strict';

const fs = require('fs');
const {
  Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun,
  WidthType, VerticalMergeType, AlignmentType, HeadingLevel, BorderStyle,
} = require('docx');

const FONT = '宋体';
const SIZE = 20; // 半磅 → 10pt，与 example 一致

function cellText(text, { align = AlignmentType.CENTER, bold = false } = {}) {
  return new Paragraph({
    alignment: align,
    children: [new TextRun({ text: text == null ? '' : String(text), font: FONT, size: SIZE, bold })],
  });
}

const THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const CELL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

function headerRow() {
  const mk = (t) => new TableCell({ borders: CELL_BORDERS, children: [cellText(t, { bold: true })] });
  return new TableRow({ tableHeader: true, children: [mk('镜号'), mk('角色'), mk('台词')] });
}

/**
 * @param {Array<{shotNo:string|null, role:string|null, line:string}>} rows 已合并的台本行（按顺序）
 * @param {string} outPath 输出 .docx 路径
 * @param {{title?:string}} [opts]
 */
async function writeDocx(rows, outPath, opts = {}) {
  // 连续相同镜号分组，用于纵向合并「镜号」列
  const tableRows = [headerRow()];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const samePrev = i > 0 && rows[i - 1].shotNo === r.shotNo && r.shotNo != null;

    const shotCell = new TableCell({
      borders: CELL_BORDERS,
      verticalMerge: samePrev ? VerticalMergeType.CONTINUE : VerticalMergeType.RESTART,
      children: [cellText(samePrev ? '' : (r.shotNo || ''))],
    });
    const roleCell = new TableCell({
      borders: CELL_BORDERS,
      children: [cellText(r.role || '')],
    });
    const lineCell = new TableCell({
      borders: CELL_BORDERS,
      children: [cellText(r.line || '', { align: AlignmentType.LEFT })],
    });

    tableRows.push(new TableRow({ children: [shotCell, roleCell, lineCell] }));
  }

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1400, 1600, 6000],
    rows: tableRows,
  });

  const children = [];
  if (opts.title) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.title, font: FONT, size: 32, bold: true })],
    }));
  }
  children.push(table);

  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buf);
  return outPath;
}

module.exports = { writeDocx };
