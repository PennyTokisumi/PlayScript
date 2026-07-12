'use strict';

const fs = require('fs');

/**
 * 把合并后的台本行输出成纯文本（不生成表格）：每行 `镜号<sep>角色<sep>台词`，行间换行。
 *
 * @param {Array<{shotNo:string|null, role:string|null, line:string}>} rows
 * @param {{sep?:string, repeatShot?:boolean, eol?:string}} [opts]
 *   sep：列分隔（默认两个空格）
 *   repeatShot：同镜号的续行是否重复镜号；false 时续行镜号留空对齐（默认 true=每行都写）
 *   eol：换行符（默认 \r\n，Windows 文本）
 * @returns {string}
 */
function toText(rows, opts = {}) {
  const sep = opts.sep != null ? opts.sep : '  ';
  const repeatShot = opts.repeatShot !== false;
  const eol = opts.eol || '\r\n';

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const same = i > 0 && rows[i - 1].shotNo === r.shotNo && r.shotNo != null;
    const shot = (!repeatShot && same) ? '' : (r.shotNo || '');
    out.push([shot, r.role || '', r.line || ''].join(sep));
  }
  return out.join(eol) + eol;
}

function writeText(rows, outPath, opts = {}) {
  fs.writeFileSync(outPath, toText(rows, opts), 'utf8');
  return outPath;
}

module.exports = { toText, writeText };
