'use strict';

/**
 * OCR 偏旁拆分纠错表。
 *
 * Windows OCR 有时把左右/上下结构的汉字拆成偏旁分开输出（如「任」→「亻壬」）。
 * 这些偏旁序列（亻/氵/扌 等 + 另一字）在正常中文里几乎不会独立成词，
 * 因此做精确替换是安全的。表可随使用不断补充。
 *
 * 顺序：先替换多字序列，再做单字规范化。
 */
const SEQUENCE_FIXES = [
  ['亻十', '什'],
  ['亻壬', '任'],
  ['氵吉', '洁'],
  ['至刂', '到'],
  ['亻尔', '你'],
  ['纟工', '红'],
  ['讠青', '请'],
  ['忄青', '情'],
  ['日月', '明'],   // 谨慎：仅在明显拆分场景；如误伤可从表中移除
];

// 单字规范化：繁体/异体 → 简体（zh-Hans 语境下安全）
const CHAR_FIXES = [
  ['務', '务'],
];

/** 对一段文本应用纠错表。 */
function fixOcr(text) {
  if (!text) return text;
  let s = text;
  for (const [bad, good] of SEQUENCE_FIXES) s = s.split(bad).join(good);
  for (const [bad, good] of CHAR_FIXES) s = s.split(bad).join(good);
  return s;
}

module.exports = { fixOcr, SEQUENCE_FIXES, CHAR_FIXES };
