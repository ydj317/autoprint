/**
 * Electron 메인 프로세스에서 사용하는 서비스 제어기.
 *
 * 등록/제거/시작/정지는 관리자 권한이 필요하므로,
 * UAC로 승격된 별도 프로세스(installer.js)에 위임한다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const config = require('./config');
const firewall = require('./firewall');

const UAC_CANCELLED = 1223;

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({ error, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
      }
    );
  });
}

/**
 * 서비스 상태를 조회한다.
 * Win32_Service의 State/StartMode는 로케일과 무관한 고정 문자열이라
 * 한국어 Windows에서도 파싱이 깨지지 않는다.
 */
async function getStatus() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$s = Get-CimInstance Win32_Service -Filter "Name='${config.SCM_NAME}'"
if ($null -eq $s) {
  Write-Output '{"installed":false}'
} else {
  [pscustomobject]@{
    installed = $true
    state     = $s.State
    startMode = $s.StartMode
    account   = $s.StartName
  } | ConvertTo-Json -Compress
}`;

  const { stdout } = await runPowerShell(script);

  let status = { installed: false };
  try {
    if (stdout) status = JSON.parse(stdout);
  } catch (_) {
    status = { installed: false };
  }

  status.running = status.state === 'Running';
  status.autoStart = status.startMode === 'Auto';
  status.port = config.PORT;

  // 서비스 상태와 무관하게 포트를 실제로 확인한다.
  // 서비스가 멈춰 있는데 포트가 열려 있다면 다른 프로그램이 쥐고 있다는 뜻이고,
  // 그대로 두면 서비스 시작이 EADDRINUSE로 실패하므로 UI에서 알려야 한다.
  status.portOpen = await isPortOpen();
  status.reachable = status.portOpen ? await probe() : false;
  return status;
}

/** 서비스가 실제로 포트에 응답하는지 확인한다. */
function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: config.PORT, path: '/api/info', timeout: 1500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/**
 * 포트가 열려 있는지만 확인한다.
 *
 * probe()는 AutoPrint 서버인지까지 보지만, 전혀 다른 프로그램이 포트를 쥐고 있어도
 * 서비스는 시작하지 못한다. 그 경우를 구분하려면 TCP 연결 가능 여부가 필요하다.
 */
function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: config.PORT });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * UAC로 승격된 프로세스에서 installer.js를 실행한다.
 * 서비스는 LocalSystem으로 등록되므로 전달할 자격 증명이 없다.
 */
function runElevated(action) {
  return new Promise((resolve) => {
    const token = crypto.randomBytes(16).toString('hex');
    const resultPath = path.join(os.tmpdir(), `autoprint-${token}.result.json`);

    const cleanup = () => {
      try {
        if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
      } catch (_) {
        // noop
      }
    };

    // 승격된 컨텍스트에서 ELECTRON_RUN_AS_NODE가 확실히 적용되도록
    // 내부 PowerShell에서 환경 변수를 직접 설정한 뒤 실행한다.
    const inner = `
$env:ELECTRON_RUN_AS_NODE = '1'
& ${psQuote(config.getExecPath())} ${psQuote(config.getInstallerScript())} ${psQuote(action)} ${psQuote(resultPath)}
exit $LASTEXITCODE`;

    const outer = `
try {
  $p = Start-Process -FilePath 'powershell.exe' \`
    -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand',${psQuote(encodePowerShell(inner))} \`
    -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
  exit $p.ExitCode
} catch {
  exit ${UAC_CANCELLED}
}`;

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(outer)],
      { windowsHide: true }
    );

    child.on('error', (error) => {
      cleanup();
      resolve({ ok: false, error: error.message });
    });

    child.on('close', (code) => {
      if (code === UAC_CANCELLED) {
        cleanup();
        return resolve({ ok: false, cancelled: true, error: '관리자 권한 요청이 취소되었습니다.' });
      }

      let result = null;
      try {
        if (fs.existsSync(resultPath)) {
          result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        }
      } catch (_) {
        result = null;
      }

      cleanup();

      if (result) return resolve(result);
      resolve({
        ok: false,
        error: `설치 프로세스가 비정상 종료되었습니다 (code ${code}). ${path.join(config.ROOT, 'install.log')} 를 확인해 주세요.`
      });
    });
  });
}

async function install() {
  return runElevated('install');
}

async function uninstall() {
  return runElevated('uninstall');
}

/** 재등록 없이 기본 프린터·폴더 권한·시작 정책만 다시 적용한다. */
async function refresh() {
  return runElevated('refresh');
}

/** 서비스 시작/정지도 관리자 권한이 필요하다. */
async function control(verb) {
  const script = `
try {
  $p = Start-Process -FilePath 'powershell.exe' \`
    -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',${psQuote(
      `${verb === 'start' ? 'Start-Service' : 'Stop-Service'} -Name '${config.SCM_NAME}' -ErrorAction Stop`
    )} \`
    -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
  exit $p.ExitCode
} catch {
  exit ${UAC_CANCELLED}
}`;

  const { error } = await runPowerShell(script);
  if (error && error.code === UAC_CANCELLED) {
    return { ok: false, cancelled: true, error: '관리자 권한 요청이 취소되었습니다.' };
  }
  if (error) {
    return { ok: false, error: `서비스 ${verb === 'start' ? '시작' : '정지'}에 실패했습니다.` };
  }
  return { ok: true };
}

/**
 * 방화벽 규칙을 현재 포트에 맞게 연다. 관리자 권한이 필요하므로 승격한다.
 * 서비스 등록 시에는 이미 같이 적용되므로, 이 경로는 서비스와 무관하게 쓰인다.
 */
async function openFirewall() {
  return runElevated('firewall');
}

module.exports = {
  getStatus,
  isPortOpen,
  install,
  uninstall,
  refresh,
  start: () => control('start'),
  stop: () => control('stop'),
  getFirewallStatus: firewall.getStatus,
  openFirewall,
  config
};
