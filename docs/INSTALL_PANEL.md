# PR 面板安装（Premiere Pro 2023+ / CEP 11）

面板 `cep/com.ezplayscript.panel/` 已自包含（内置 `src/` 管线 + `node_modules/`），**无需依赖外部项目**。

## 安装

### 1) 开启未签名扩展调试
`regedit` 新建字符串值（CSXS 9/10/11 都设）：
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11  →  PlayerDebugMode (字符串) = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.10  →  PlayerDebugMode (字符串) = 1
HKEY_CURRENT_USER\Software\Adobe\CSXS.9   →  PlayerDebugMode (字符串) = 1
```
或存为 `debug.reg` 双击导入：
```reg
Windows Registry Editor Version 5.00
[HKEY_CURRENT_USER\Software\Adobe\CSXS.11]
"PlayerDebugMode"="1"
[HKEY_CURRENT_USER\Software\Adobe\CSXS.10]
"PlayerDebugMode"="1"
[HKEY_CURRENT_USER\Software\Adobe\CSXS.9]
"PlayerDebugMode"="1"
```

### 2) 安装面板
将 `cep/com.ezplayscript.panel/` 整个文件夹复制到：
```
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\
```
（开发时可用 `mklink /J` 目录联接，改代码即时生效）

### 3) 确认系统依赖
- **ffmpeg**：需自行安装并加入系统 PATH（https://ffmpeg.org/download.html）
- **Windows OCR**：Win10+ 默认含 `zh-Hans-CN`；若提示 OCR 失败，检查「设置 › 语言 › 中文(简体)」语言包是否安装

## 使用
1. 重启 PR → 窗口 › 扩展 › **ezPlayScript**
2. 播放头拖到目标帧 → Ctrl+Shift+E 导出帧 → 保存到**桌面 `.ezCapture` 文件夹**
3. 面板自动检测 → OCR → 追加一行
4. 表格可编辑镜号/角色/台词；下方实时预览
5. 导出 txt / docx（默认输出到桌面）

## 依赖
- Premiere Pro 2023+（CEP 11，含 Node）
- Windows 10+（自带中文 OCR + PowerShell）
- ffmpeg（需安装并加入 PATH）

## 调试
面板出错时浏览器打开 http://localhost:8088（端口见 `.debug`）可用 Chrome DevTools 调试 JS。
