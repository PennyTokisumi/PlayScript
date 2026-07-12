'use strict';

/* ezPlayScript by Toki33 — PR 面板主逻辑。
 * 依赖 PR 面板已启用 Node（manifest --enable-nodejs）。 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const { ocr } = require('../src/ocr/ocr');
const { parseFrame } = require('../src/parse/parse');
const { buildRows } = require('../src/pipeline');
const { toText } = require('../src/output/text');
const { writeDocx } = require('../src/docx/docx');

/** 字幕颜色，默认白色，可手动输入 hex 或点击缩略图取色 */
let pickedColor = '#FFFFFF';

function getColorFilter() {
  if (!pickedColor) return '';
  return 'colorkey=0x' + pickedColor.replace('#', '') + ':similarity=0.5:blend=0.1,alphaextract';
}

/** 抓取到的逐帧记录（按点击顺序）。每项：{shotNo, role, line, warnings} */
let frames = [];

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function currentOpts() {
  return {
    splitSpeakers: $('optSplit').checked,
    repeatShot: !$('optMergeShot').checked,
  };
}

// —— 文件夹监听（轮询 .capture/ 新文件）——
var CAPDIR = path.join(os.homedir(), 'Desktop', '.ezCapture');
var _watchTimer = null;
var _knownFiles = {}; // 记录已处理文件名 → 避免重复 OCR

function scanCaptureDir() {
  try {
    var files = fs.readdirSync(CAPDIR);
  } catch (e) { return; }
  files.forEach(function (f) {
    if (_knownFiles[f]) return;
    _knownFiles[f] = true;
    if (!/\.(png|jpg|jpeg|bmp)$/i.test(f)) return;
    var fp = path.join(CAPDIR, f);
    setStatus('识别中…');
    setTimeout(function () {
      try {
        // 第一遍：全帧 OCR 拿镜号（左上 SC 标签）
        // 全帧增强：灰度+对比度，镜号标签更稳
        var fullCrop = fp.replace(/\.\w+$/, '_full.png');
        require('child_process').execFileSync('ffmpeg', [
          '-y', '-i', fp,
          '-vf', 'format=gray,eq=contrast=1.3',
          fullCrop
        ], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
        var quick = ocr(fullCrop, { scale: 3 });
        try { fs.unlinkSync(fullCrop); } catch (_) {}
        var parsed = parseFrame(quick);
        parsed.warnings = []; // 第一遍只取镜号，忽略台词相关告警
        // 第二遍：滤色 → 裁切底部 25% → Lanczos 4x 放大 → OCR 台词
        var cropPath = fp.replace(/\.\w+$/, '_crop.png');
        var vfParts = [];
        var cf = getColorFilter();
        if (cf) {
          vfParts.push(cf);
        } else {
          vfParts.push('format=gray,eq=contrast=1.5');
        }
        vfParts.push('crop=iw:ih*0.25:0:ih*0.75');
        vfParts.push('scale=iw*4:ih*4:flags=lanczos');
        require('child_process').execFileSync('ffmpeg', [
          '-y', '-i', fp,
          '-vf', vfParts.join(','),
          cropPath
        ], { stdio: 'ignore', windowsHide: true, timeout: 30000 });
        var detail = ocr(cropPath, { scale: 1 });
        try { fs.unlinkSync(cropPath); } catch (_) {}

        // 裁切图里不设 y 过滤：取所有非"说明"的含冒号行，最下一条即为台词
        var fixOcr = require('../src/parse/ocrfix').fixOcr;
        var cropLines = (detail.lines || []).map(function (l) { return { clean: l.text.replace(/\s+/g, ''), y: l.y }; });
        var dlgCand = cropLines.filter(function (l) {
          return /[:：·]/.test(l.clean) && !/^说\s*明[:：]/.test(l.clean);
        });
        dlgCand.sort(function (a, b) { return b.y - a.y; });
        if (dlgCand.length) {
          var m = dlgCand[0].clean.match(/^(.*?)[:：·](.*)$/);
          if (m) {
            parsed.role = fixOcr(m[1].trim());
            parsed.line = fixOcr(m[2].trim());
          }
        }
        frames.push(parsed);
        renderTable();
        updatePreview();
        try { fs.unlinkSync(fp); } catch (_) {}
        delete _knownFiles[f];
        var flag = parsed.warnings.length ? ' ⚠ ' + parsed.warnings.join('; ') : '';
        setStatus((parsed.shotNo || '??') + ' / ' + (parsed.role || '—') + flag,
          parsed.warnings.length ? 'warn' : 'ok');
      } catch (e) {
        setStatus('OCR 失败：' + e.message, 'err');
        // 不删 _knownFiles —— 避免无限重试同一张图
      }
    }, 100); // 等文件写完
  });
}

function startWatch() {
  if (_watchTimer) clearInterval(_watchTimer);
  _watchTimer = setInterval(scanCaptureDir, 600);
}

// —— 抓取：PR 2023 无法通过脚本触发导出帧。打开 .capture 文件夹，
//   用户用 Ctrl+Shift+E 导出帧存入即可自动 OCR。——
function capture() {
  try { fs.mkdirSync(CAPDIR); } catch (_) {}
  startWatch();
  // 用 Explorer 打开 .capture 文件夹
  try { require('child_process').exec('explorer "' + CAPDIR + '"'); } catch (_) {}
  setStatus('监听中… Ctrl+Shift+E 导出帧 → 存到桌面 .ezCapture → 自动识别', 'ok');
}

// —— 渲染抓取记录表（可编辑）——
function renderTable() {
  const body = $('frameBody');
  body.innerHTML = '';
  frames.forEach(function (f, idx) {
    const tr = document.createElement('tr');
    if (f.warnings && f.warnings.length) tr.className = 'warn';
    tr.title = (f.warnings && f.warnings.length) ? f.warnings.join('；') : '';

    tr.appendChild(editableCell(f.shotNo || '', 'shot', idx, 'shotNo'));
    tr.appendChild(editableCell(f.role || '', 'role', idx, 'role'));
    tr.appendChild(editableCell(f.line || '', 'line', idx, 'line'));

    const del = document.createElement('td');
    del.className = 'del';
    del.textContent = '✕';
    del.onclick = function () { frames.splice(idx, 1); renderTable(); updatePreview(); };
    tr.appendChild(del);

    body.appendChild(tr);
  });
}

function editableCell(value, cls, idx, field) {
  const td = document.createElement('td');
  td.className = cls;
  td.contentEditable = 'true';
  td.textContent = value;
  td.addEventListener('input', function () {
    frames[idx][field] = td.textContent;
    updatePreview();
  });
  return td;
}

// —— 台本预览（跑一遍继承+合并+拆分）——
function updatePreview() {
  try {
    // 按镜号排序，同镜号保持捕获顺序（补帧时不会因不相邻导致未合并）
    var sorted = frames.map(function (f, i) { f._capIdx = i; return f; });
    sorted.sort(function (a, b) {
      var na = parseInt(a.shotNo, 10), nb = parseInt(b.shotNo, 10);
      if (isNaN(na) && isNaN(nb)) return a._capIdx - b._capIdx;
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb || a._capIdx - b._capIdx;
    });
    var rows = buildRows(sorted, currentOpts());
    $('preview').value = toText(rows, { repeatShot: currentOpts().repeatShot, eol: '\n' });
  } catch (e) {
    $('preview').value = '预览出错：' + e.message;
  }
}

// —— 导出路径 ——
function getOutDir() {
  var raw = $('outDir').value.trim();
  return raw || path.join(os.homedir(), 'Desktop');
}

function browseOutDir() {
  // 简单方案：弹 prompt 让你粘贴/输入。未来可换 CEP 原生文件对话框。
  var cur = getOutDir();
  var input = prompt('输出目录：', cur);
  if (input) $('outDir').value = input;
}

// —— 导出 ——
function exportTxt() {
  try {
    var rows = buildRows(frames, currentOpts());
    var out = path.join(getOutDir(), '台本.txt');
    fs.writeFileSync(out, toText(rows, { repeatShot: currentOpts().repeatShot }), 'utf8');
    setStatus('已导出：' + out, 'ok');
  } catch (e) { setStatus('导出失败：' + e.message, 'err'); }
}

function exportDocx() {
  try {
    var rows = buildRows(frames, currentOpts());
    var out = path.join(getOutDir(), '台本.docx');
    writeDocx(rows, out).then(function () {
      setStatus('已导出：' + out, 'ok');
    }).catch(function (e) { setStatus('导出失败：' + e.message, 'err'); });
  } catch (e) { setStatus('导出失败：' + e.message, 'err'); }
}

function clearAll() {
  if (frames.length && !confirm('清空所有抓取记录？')) return;
  frames = [];
  renderTable();
  updatePreview();
  setStatus('已清空');
}

// —— 绑定 ——
$('btnCapture').onclick = capture;
$('btnExportTxt').onclick = exportTxt;
$('btnExportDocx').onclick = exportDocx;
$('btnClear').onclick = clearAll;
$('btnBrowse').onclick = browseOutDir;
$('optSplit').onchange = updatePreview;
$('optMergeShot').onchange = updatePreview;

// 色块初始
$('colorSwatch').style.background = '#FFFFFF';

// hex 手动输入，更新色块
$('colorHex').oninput = function () {
  var v = this.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    pickedColor = v;
    $('colorSwatch').style.background = v;
  }
};

// —— 启动：面板即开即监听 .capture 文件夹 ——
(function init() {
  $('outDir').value = path.join(os.homedir(), 'Desktop');
  try { fs.mkdirSync(CAPDIR); } catch (_) {}
  startWatch();
  var ffOk = true;
  try { require('child_process').execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true, timeout: 5000 }); }
  catch (_) { ffOk = false; }
  setStatus('ezPlayScript v1.0 · Ctrl+Shift+E → 桌面 .ezCapture' + (ffOk ? '' : ' ⚠ ffmpeg 未找到'), ffOk ? 'ok' : 'warn');
})();
