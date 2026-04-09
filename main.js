const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Server = require('./src/server');
const PrinterManager = require('./src/printer');

let mainWindow;
let server;
let printerManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: false,
    title: 'AutoPrint'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function loadPrintersFromElectron() {
  if (!mainWindow) {
    console.log('No main window');
    return [];
  }

  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    console.log('Electron printers:', printers);
    printerManager.setPrinters(printers);
    return printers;
  } catch (error) {
    console.error('Failed to load printers from Electron:', error);
    return [];
  }
}

async function startServer() {
  printerManager = new PrinterManager();
  await printerManager.init();

  server = new Server(printerManager);
  const port = await server.start();

  return port;
}

function setupIpc() {
  ipcMain.handle('get-printers', async () => {
    return printerManager.getPrinters();
  });

  ipcMain.handle('load-printers', async () => {
    return await loadPrintersFromElectron();
  });
}

app.whenReady().then(async () => {
  createWindow();
  setupIpc();
  const port = await startServer();

  mainWindow.webContents.on('did-finish-load', async () => {
    await loadPrintersFromElectron();
    mainWindow.webContents.send('server-started', { port });
  });
});

app.on('window-all-closed', () => {
  if (server) {
    server.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
