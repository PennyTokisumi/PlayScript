'use strict';

const { mergeRows, expandSpeakers } = require('./merge/merge');

/**
 * 从「按抓取/时间顺序排列的逐帧解析结果」构建最终台本行。
 * CLI 与 PR 面板共用，保证两端行为一致。
 *
 * 步骤：说话人继承（续行从同镜号上一帧继承）→ 相邻合并 → 多说话人拆分。
 *
 * @param {Array<{shotNo:string|null, role:string|null, line:string|null, warnings?:string[]}>} frames
 * @param {{joiner?:string, splitSpeakers?:boolean}} [opts]
 * @returns {Array<{shotNo:string|null, role:string|null, line:string, warnings:string[]}>}
 */
function buildRows(frames, opts = {}) {
  const f = frames.map((x) => ({ ...x, warnings: x.warnings ? [...x.warnings] : [] }));

  // 说话人继承：续行(无说话人)从同镜号上一帧继承角色
  for (let i = 1; i < f.length; i++) {
    if (!f[i].role && f[i].line && f[i - 1].role && f[i - 1].shotNo === f[i].shotNo) {
      f[i].role = f[i - 1].role;
      f[i].warnings.push('说话人继承自上一帧');
    }
  }

  let rows = mergeRows(f, { joiner: opts.joiner || '' });
  if (opts.splitSpeakers !== false) rows = expandSpeakers(rows);
  return rows;
}

module.exports = { buildRows };
