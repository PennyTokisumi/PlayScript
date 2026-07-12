'use strict';

const { fixOcr } = require('./ocrfix');

/**
 * 把「整帧 OCR 行」按特征+方位归类成一条台本记录。
 *
 * 依据对真实分镜帧的实测（1920x1080）：
 *   - 说明：……            顶部、以「说明」开头         → 丢弃
 *   - ep26_SC002           左上（x 小）、含 SC+数字      → 镜号（用户重排过的正确编号）
 *   - Sc_002 / 127         右上（x 大）                  → 丢弃（分镜师原编号 & 时间码）
 *   - 雪王：正在执行擦地任务！ 中下部、含冒号、非「说明」   → 角色 + 台词
 *
 * 位置不写死：镜号靠 SC 正则命中 + 左上方位，台词靠「中下部 + 含冒号 + 非说明」，
 * 容忍上下漂移。
 */

/** 去掉 OCR 在字符间插入的空白（中文/标签都无有意义空格）。 */
function stripSpaces(s) {
  return (s || '').replace(/\s+/g, '');
}

/**
 * 从一行文本里抽取镜号数字（SC 后面的数字），保留前导零。
 * 「ep26_SC002」→「002」；容忍 SC 与数字间夹一个分隔符（_ - 一 空格）。
 * 注意：只在 SC 上下文里把「一」当分隔符，绝不全局替换「一」（台词里「一」是常用字）。
 */
function extractShotNo(text) {
  const m = stripSpaces(text).match(/S\s*C[_\-一]?(\d{1,4})/i);
  return m ? m[1] : null;
}

/** 判断某行是不是「说明」注释行。 */
function isDescription(cleaned) {
  return /^说明[:：]/.test(cleaned);
}

/**
 * @param {{file:string,width:number,height:number,lines:Array<{text:string,x:number,y:number,w:number,h:number}>}} ocr
 * @returns {{file:string, shotNo:string|null, role:string|null, line:string|null,
 *            warnings:string[], raw:{shot?:object, dialogue?:object}}}
 */
function parseFrame(ocr) {
  const W = ocr.width || 1920;
  const H = ocr.height || 1080;
  const warnings = [];

  // 逐行预处理
  const lines = (ocr.lines || []).map((l) => ({ ...l, clean: stripSpaces(l.text) }));

  // —— 镜号候选：含 SC+数字，且在左上区域（左半 + 上部）——
  const shotCands = lines.filter((l) => {
    if (!/S\s*C[_\-一]?\d/i.test(l.clean)) return false;
    const left = l.x < W * 0.5;      // 左半（排除右上角的 Sc_xxx，其 x≈1619）
    const upper = l.y < H * 0.45;     // 上部
    return left && upper;
  });
  // 优先带 ep 前缀的；否则取最靠左的
  shotCands.sort((a, b) => {
    const ae = /ep/i.test(a.clean) ? 0 : 1;
    const be = /ep/i.test(b.clean) ? 0 : 1;
    return ae - be || a.x - b.x;
  });
  const shotLine = shotCands[0] || null;
  const shotNo = shotLine ? extractShotNo(shotLine.clean) : null;
  if (!shotNo) warnings.push('未识别到镜号（左上 SC 标签）');

  // —— 台词：中下部（排除「说明」）的所有文本框，按同一行分组后拼接，再按冒号拆 ——
  // 之所以要拼接：OCR 常把「角色：」和台词拆成同一行的多个框（如「大个孑：」+「叩咀阿叩咀。」）。
  const lowerBoxes = lines.filter((l) => l.y > H * 0.5 && !isDescription(l.clean) && l.clean.length > 0);

  let dlgBoxes = [];
  let dialogueText = null;
  if (lowerBoxes.length) {
    // 取最靠下的那一行（同一 y 带，容差 4% 画面高）
    const maxY = Math.max(...lowerBoxes.map((b) => b.y));
    const tol = H * 0.04;
    dlgBoxes = lowerBoxes.filter((b) => Math.abs(b.y - maxY) <= tol).sort((a, b) => a.x - b.x);
    dialogueText = dlgBoxes.map((b) => b.clean).join('');
  }

  let role = null;
  let line = null;
  if (dialogueText) {
    // 冒号变体：全角：/半角:/OCR 常把冒号误认的·、∶
    const m = dialogueText.match(/^(.*?)[：:·∶](.*)$/);
    if (m) {
      role = fixOcr(m[1].trim()) || null;
      line = fixOcr(m[2].trim());
      if (!role) warnings.push('说话人为空（冒号前未识别，需继承/人工）');
      if (!line) warnings.push('台词为空（冒号后未识别）');
    } else {
      // 无冒号：多半是续行，整段都是台词，说话人待继承
      role = null;
      line = fixOcr(dialogueText.trim());
      warnings.push('无冒号，按续行处理（说话人待继承/人工）');
    }
  } else {
    warnings.push('未识别到台词（中下部无文本）');
  }

  return {
    file: ocr.file,
    shotNo,
    role,
    line,
    warnings,
    raw: {
      shot: shotLine ? { text: shotLine.text, x: shotLine.x, y: shotLine.y } : undefined,
      dialogue: dlgBoxes.length ? { text: dlgBoxes.map((b) => b.text).join(' '), boxes: dlgBoxes.length } : undefined,
    },
  };
}

module.exports = { parseFrame, extractShotNo, stripSpaces, isDescription };
