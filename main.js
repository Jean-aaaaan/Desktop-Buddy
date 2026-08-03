const { app, BrowserWindow, ipcMain, Tray, Menu, powerMonitor, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const os = require('os');
const { spawn } = require('child_process');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();

let win, tray, deskMonitor;
let manuallyHidden = false;   // user toggled off via tray
let userDataPath;
let quotesPath;

// PowerShell script that watches the foreground window and prints "show" or "hide"
const DESK_WATCHER_PS = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DeskCheck {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
}
'@
$prev = ''
while ($true) {
    $hwnd = [DeskCheck]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 256
    [DeskCheck]::GetClassName($hwnd, $sb, 256) | Out-Null
    $cls = $sb.ToString()
    $desktopClasses = @('Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd','SysListView32','SHELLDLL_DefView','DV2ControlHost','')
    $isDesktop = $desktopClasses -contains $cls
    $status = if ($isDesktop) { 'show' } else { 'hide' }
    if ($status -ne $prev) { Write-Host $status; $prev = $status }
    Start-Sleep -Milliseconds 350
}
`;

function startDesktopMonitor() {
  const scriptPath = path.join(os.tmpdir(), 'deskwatch_buddy.ps1');
  fs.writeFileSync(scriptPath, DESK_WATCHER_PS, 'utf8');

  deskMonitor = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', scriptPath
  ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

  let buf = '';
  deskMonitor.stdout.on('data', (data) => {
    buf += data.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const cmd = line.trim();
      if (!win || win.isDestroyed() || manuallyHidden) continue;
      if (cmd === 'show') win.show();
      else if (cmd === 'hide') win.hide();
    }
  });

  deskMonitor.on('exit', () => {
    // Restart monitor if it dies unexpectedly
    if (!app.isQuitting) setTimeout(startDesktopMonitor, 2000);
  });
}

// Build a 16×16 orange hexagonal PNG programmatically (no deps needed)
function createTrayIconPNG() {
  const W = 16, H = 16;
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.allocUnsafe(1 + W * 4);
    row[0] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const cx = x - 7.5, cy = y - 7.5;
      const inHex = Math.abs(cx) + Math.abs(cy) <= 9 && Math.abs(cx) <= 6.5 && Math.abs(cy) <= 6.5;
      const off = 1 + x * 4;
      row[off]     = inHex ? 249 : 0;
      row[off + 1] = inHex ? 115 : 0;
      row[off + 2] = inHex ? 22  : 0;
      row[off + 3] = inHex ? 255 : 0;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.allocUnsafe(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function createWindow() {
  const { screen } = require('electron');
  const workArea = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');
}

function createTray() {
  const { nativeImage } = require('electron');
  const iconBuf = createTrayIconPNG();
  const icon = nativeImage.createFromBuffer(iconBuf);

  tray = new Tray(icon);
  tray.setToolTip('Desktop Buddy — right-click for options');

  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Change Character…',
      click: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Choose your character image',
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
          properties: ['openFile']
        });
        if (!result.canceled && result.filePaths.length) {
          fs.copyFileSync(result.filePaths[0], path.join(userDataPath, 'character.png'));
          if (win && !win.isDestroyed()) win.webContents.send('character-updated');
        }
      }
    },
    {
      label: 'Manage Quotes',
      click: () => createAddQuoteWindow()
    },
    {
      label: 'Toggle Buddy',
      click: () => {
        manuallyHidden = !manuallyHidden;
        if (manuallyHidden) win.hide();
        else win.show();
        rebuild();
      }
    },
    {
      label: 'Start on login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          name: 'Desktop Buddy',
          path: process.execPath,
          args: [path.resolve(__dirname)]
        });
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));

  rebuild();
}

function createAddQuoteWindow() {
  const mgr = new BrowserWindow({
    width: 420,
    height: 540,
    frame: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 340,
    minHeight: 360,
    title: 'Your Quotes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mgr.setMenuBarVisibility(false);
  mgr.loadFile('quote-manager.html');
}

app.whenReady().then(() => {
  userDataPath = app.getPath('userData');
  quotesPath = path.join(userDataPath, 'quotes.json');

  // Seed quotes from bundled file on first run
  if (!fs.existsSync(quotesPath)) {
    const bundled = path.join(__dirname, 'quotes.json');
    try {
      fs.copyFileSync(bundled, quotesPath);
    } catch {
      fs.writeFileSync(quotesPath, '[]', 'utf8');
    }
  }

  createWindow();
  createTray();
  if (process.platform === 'win32') startDesktopMonitor();

  powerMonitor.on('unlock-screen', () => {
    if (win && !win.isDestroyed()) win.webContents.send('screen-unlocked');
  });
  powerMonitor.on('resume', () => {
    if (win && !win.isDestroyed()) win.webContents.send('screen-unlocked');
  });
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (deskMonitor) deskMonitor.kill();
});

// Toggle click-through from renderer (when mouse is over character)
ipcMain.on('set-clickable', (event, clickable) => {
  if (!win || win.isDestroyed()) return;
  if (clickable) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
});

ipcMain.handle('read-quotes', () => {
  try {
    return JSON.parse(fs.readFileSync(quotesPath, 'utf8'));
  } catch {
    return [];
  }
});

ipcMain.handle('write-quotes', (event, quotes) => {
  fs.writeFileSync(quotesPath, JSON.stringify(quotes, null, 2), 'utf8');
  if (win && !win.isDestroyed()) {
    win.webContents.send('quotes-updated', quotes);
  }
});

ipcMain.handle('get-calendar-events', async (event, dateStr) => {
  try {
    const calendar = require('./calendar');
    return await calendar.getCalendarEvents(dateStr);
  } catch {
    return null;
  }
});

ipcMain.handle('get-character-data-url', () => {
  try {
    const charPath = path.join(userDataPath, 'character.png');
    if (!fs.existsSync(charPath)) return null;
    return 'data:image/png;base64,' + fs.readFileSync(charPath).toString('base64');
  } catch { return null; }
});
