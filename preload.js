const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readQuotes: () => ipcRenderer.invoke('read-quotes'),
  writeQuotes: (quotes) => ipcRenderer.invoke('write-quotes', quotes),
  getCalendarEvents: (dateStr) => ipcRenderer.invoke('get-calendar-events', dateStr),
  setClickable: (val) => ipcRenderer.send('set-clickable', val),
  onQuotesUpdated: (cb) => ipcRenderer.on('quotes-updated', (_e, q) => cb(q)),
  onScreenUnlocked: (cb) => ipcRenderer.on('screen-unlocked', () => cb()),
  getCharacterDataUrl: () => ipcRenderer.invoke('get-character-data-url'),
  onCharacterUpdated: (cb) => ipcRenderer.on('character-updated', () => cb()),
});
