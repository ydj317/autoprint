const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const serviceManager = require('./src/service/manager');

/**
 * 인쇄 서버는 Windows 서비스만 띄운다.
 *
 * 이 앱은 서비스를 등록/제어하고 상태를 보여주는 관리 UI일 뿐이며,
 * 어떤 경우에도 직접 포트를 열지 않는다. 앱이 예비로 서버를 띄우면
 * 서비스 등록 여부와 무관하게 포트가 열려 버려서, 지금 인쇄가 되는 이유가
 * 서비스인지 앱인지 구분할 수 없게 된다.
 */
let mainWindow;

// 콘텐츠 너비(560) + body 좌우 여백(20씩). 세로는 렌더러가 재서 알려준다.
const WINDOW_WIDTH = 600;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: false,
    // 첫 높이가 정해진 뒤에 보여준다. 그래야 창이 한 번 줄었다 늘어나지 않는다.
    show: false,
    title: 'AutoPrint'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 렌더러가 잰 콘텐츠 높이에 창을 맞춘다.
 *
 * 서비스 상태에 따라 카드 안의 줄 수와 버튼 수가 달라져서, 창을 고정하면 어떤
 * 상태에서는 스크롤이 생기고 다른 상태에서는 빈 공간이 남는다.
 * 화면(작업 표시줄 제외)보다 커지지 않도록 상한을 두고, 그때는 렌더러가 스크롤한다.
 */
function resizeToContent(height) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const workArea = screen.getDisplayMatching(mainWindow.getBounds()).workAreaSize;
  const clamped = Math.max(320, Math.min(Math.round(height), workArea.height - 40));

  if (mainWindow.getContentSize()[1] !== clamped) {
    mainWindow.setContentSize(WINDOW_WIDTH, clamped);
  }

  if (!mainWindow.isVisible()) {
    mainWindow.center();
    mainWindow.show();
  }
}

function setupIpc() {
  ipcMain.on('resize-to-content', (event, height) => resizeToContent(height));

  ipcMain.handle('service:status', () => serviceManager.getStatus());

  /**
   * 포트는 서버에 물어보지 않고 앱이 직접 알려준다.
   * 서비스가 꺼져 있을 때도 화면에 표시하고, 프린터 조회 주소를 만드는 데 쓴다.
   */
  ipcMain.handle('service-port', () => serviceManager.config.PORT);

  /**
   * 서비스가 어떤 프린터를 보는지 비교하기 위한 기준 목록.
   * 서비스는 LocalSystem으로 돌기 때문에 사용자 계정 전용 프린터가 빠질 수 있다.
   */
  ipcMain.handle('system-printers', async () => {
    if (!mainWindow) return [];
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers.map((p) => p.name);
    } catch (error) {
      console.error('Failed to list system printers:', error);
      return [];
    }
  });

  ipcMain.handle('firewall:status', () => serviceManager.getFirewallStatus());
  ipcMain.handle('firewall:open', () => serviceManager.openFirewall());

  ipcMain.handle('service:install', () => serviceManager.install());
  ipcMain.handle('service:refresh', () => serviceManager.refresh());
  ipcMain.handle('service:uninstall', () => serviceManager.uninstall());
  ipcMain.handle('service:start', () => serviceManager.start());
  ipcMain.handle('service:stop', () => serviceManager.stop());
}

/**
 * 앱은 한 번만 뜨게 한다.
 *
 * 창이 여러 개면 방화벽 확인도 그만큼 돌아 관리자 권한 창이 겹쳐 뜨고,
 * 같은 사용자 데이터 폴더를 두고 다투면서 캐시 오류도 난다.
 * 이미 떠 있으면 그 창을 앞으로 가져오는 편이 사용자가 기대하는 동작이다.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    setupIpc();
  });
}

app.on('window-all-closed', () => {
  // 인쇄 서버는 서비스 쪽에서 계속 돌아가므로 여기서 정리할 것이 없다.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
