/**
 * Windows 서비스로 실행되는 헤드리스 진입점.
 *
 * Electron의 내장 Node로 구동된다 (ELECTRON_RUN_AS_NODE=1).
 * BrowserWindow가 없으므로 프린터 목록은 webContents.getPrintersAsync()가 아니라
 * pdf-to-printer가 시스템에서 직접 읽어온다.
 */
const fs = require('fs');
const PrinterManager = require('../printer');
const Server = require('../server');
const config = require('./config');
const { readUserDefaultPrinter } = require('./user-printer');

// 프린터 추가/제거와 기본 프린터 변경을 따라잡기 위한 주기.
// 사용자가 기본 프린터를 바꾸고 바로 인쇄하는 경우가 흔해 짧게 잡는다.
const PRINTER_REFRESH_MS = 60 * 1000;

/** 등록 시점에 기록해 둔 설정. 없으면 빈 객체. */
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

let server = null;
let refreshTimer = null;
let shuttingDown = false;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * 지금 이 순간의 사용자 기본 프린터.
 *
 * settings.json에 적힌 이름은 설치 시점의 값이라 사용자가 기본 프린터를 바꾸면
 * 낡는다. SID로 레지스트리를 직접 읽어 현재 값을 우선 쓰고, 사용자가 로그오프해
 * 읽지 못할 때만 기록해 둔 값으로 돌아간다.
 */
async function resolveDefaultPrinter(settings) {
  const live = await readUserDefaultPrinter(settings.userSid);
  if (live) return live;

  if (settings.defaultPrinter) {
    log(`Falling back to recorded default printer: ${settings.defaultPrinter}`);
  }
  return settings.defaultPrinter || null;
}

async function refreshPrinters(printerManager, settings) {
  const preferred = await resolveDefaultPrinter(settings);
  await printerManager.loadFromSystem(preferred);
}

async function main() {
  const settings = readSettings();
  const printerManager = new PrinterManager();
  await printerManager.init();

  try {
    await refreshPrinters(printerManager, settings);
  } catch (error) {
    // 프린터를 못 읽어도 서버는 띄운다. 이후 갱신에서 복구될 수 있다.
    log(`Failed to load printers: ${error.message}`);
  }

  server = new Server(printerManager);
  const port = await server.start();
  log(`AutoPrint service listening on port ${port}`);

  refreshTimer = setInterval(() => {
    refreshPrinters(printerManager, settings).catch((error) => {
      log(`Printer refresh failed: ${error.message}`);
    });
  }, PRINTER_REFRESH_MS);
  refreshTimer.unref();
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Shutting down (${reason})`);

  if (refreshTimer) clearInterval(refreshTimer);
  if (server) server.stop();

  // 소켓이 닫힐 시간을 조금 준 뒤 종료한다.
  setTimeout(() => process.exit(0), 500);
}

// node-windows 래퍼는 stopparentfirst 모드에서 'shutdown' 메시지를 보낸다.
process.on('message', (msg) => {
  if (msg === 'shutdown') shutdown('wrapper message');
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.stack || error.message}`);
});
process.on('unhandledRejection', (error) => {
  log(`Unhandled rejection: ${(error && error.stack) || error}`);
});

main().catch((error) => {
  log(`Service failed to start: ${error.stack || error.message}`);
  process.exit(1);
});
