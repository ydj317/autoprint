const path = require('path');
const { PORT } = require('../shared/network');

const NAME = 'AutoPrint';
const DESCRIPTION = `AutoPrint 자동 인쇄 서버 (포트 ${PORT})`;

// node-windows가 name에서 파생시키는 내부 ID. 생성되는 파일명이 여기서 나온다
// (autoprint.exe / autoprint.xml).
const ID = NAME.replace(/[^\w]/gi, '').toLowerCase();

// SCM에 실제로 등록되는 서비스 이름.
// node-windows는 winsw XML의 <id>에 ID가 아니라 ID + '.exe'를 넣기 때문에
// sc.exe / Get-Service 로 조회할 때는 반드시 이 이름을 써야 한다.
const SCM_NAME = `${ID}.exe`;

// 서비스는 부팅 시 시작되므로 사용자 프로필(%APPDATA%)이 아니라
// 항상 접근 가능한 머신 공용 경로에 winsw 래퍼와 로그를 둔다.
const ROOT = path.join(process.env.ProgramData || 'C:\\ProgramData', 'AutoPrint');

// node-windows가 실제로 파일을 만드는 위치는 <ROOT>/daemon 이다.
const DAEMON_DIR = path.join(ROOT, 'daemon');

// 서비스는 LocalSystem으로 돌기 때문에 사용자의 기본 프린터(HKCU에 저장됨)를 알 수 없다.
// 등록 시점에 사용자 기본 프린터를 여기에 적어두고 데몬이 읽어 쓴다.
const SETTINGS_FILE = path.join(DAEMON_DIR, 'settings.json');

/**
 * 서비스 프로세스가 실행할 스크립트.
 * asar 안에 있으면 winsw가 존재 여부를 확인하지 못하므로
 * electron-builder의 asarUnpack으로 src/service를 풀어둔다.
 */
/**
 * asar 안의 경로를 풀린 경로로 바꾼다.
 *
 * 이미 `app.asar.unpacked`를 가리키고 있으면 그대로 둔다. 무턱대고 치환하면
 * `app.asar.unpacked.unpacked`라는 없는 경로가 만들어져, 서비스에 엉뚱한 스크립트
 * 경로가 등록되고 등록 자체가 조용히 실패한다.
 */
function toUnpackedPath(filePath) {
  if (filePath.includes('app.asar.unpacked')) return filePath;
  return filePath.replace('app.asar', 'app.asar.unpacked');
}

function getDaemonScript() {
  return toUnpackedPath(path.join(__dirname, 'daemon.js'));
}

function getInstallerScript() {
  return toUnpackedPath(path.join(__dirname, 'installer.js'));
}

/**
 * 서비스가 실행할 실행 파일.
 * 개발 중에는 electron.exe, 패키징 후에는 AutoPrint.exe 이며
 * 둘 다 ELECTRON_RUN_AS_NODE=1 이면 순수 Node로 동작한다.
 */
function getExecPath() {
  return process.execPath;
}

module.exports = {
  NAME,
  toUnpackedPath,
  ID,
  SCM_NAME,
  DESCRIPTION,
  ROOT,
  DAEMON_DIR,
  SETTINGS_FILE,
  PORT,
  getDaemonScript,
  getInstallerScript,
  getExecPath
};
