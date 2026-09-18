/**
 * 관리자 권한으로 실행되는 서비스 설치/제거 헬퍼.
 *
 * UAC로 승격된 별도 프로세스로 구동된다 (ELECTRON_RUN_AS_NODE=1).
 * 서비스는 LocalSystem으로 등록하므로 계정/비밀번호를 받지 않는다.
 *
 *   installer.js install|uninstall <결과 파일 경로>
 */
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const config = require('./config');
const firewall = require('./firewall');

const action = process.argv[2];
const resultPath = process.argv[3];

function logLine(message) {
  try {
    fs.mkdirSync(config.ROOT, { recursive: true });
    fs.appendFileSync(
      path.join(config.ROOT, 'install.log'),
      `[${new Date().toISOString()}] ${message}\r\n`
    );
  } catch (_) {
    // 로그 실패가 설치를 막지는 않는다.
  }
}

function finish(result) {
  if (resultPath) {
    try {
      fs.writeFileSync(resultPath, JSON.stringify(result), 'utf8');
    } catch (error) {
      logLine(`Failed to write result: ${error.message}`);
    }
  }
  logLine(`Result: ${result.ok ? 'ok' : 'failed'}${result.error ? ' - ' + result.error : ''}`);
  process.exit(result.ok ? 0 : 1);
}

function run(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', windowsHide: true });
}

/** 서비스가 SCM에 실제로 존재하는지 확인한다 (로케일 무관). */
function serviceExistsInScm() {
  try {
    run('sc.exe', ['query', config.SCM_NAME]);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 서비스 상태를 읽는다. 'Running' / 'Stopped' / '' 중 하나.
 * sc.exe 출력은 로케일에 따라 번역될 수 있으나
 * Win32_Service의 State는 고정 문자열이라 안전하다.
 */
function getServiceState() {
  try {
    return run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Service -Filter "Name='${config.SCM_NAME}'").State`
    ]).trim();
  } catch (_) {
    return '';
  }
}

/** 서비스가 완전히 멈출 때까지 기다린다. */
function waitForStopped(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getServiceState() !== 'Running') return true;
  }
  return false;
}

/**
 * 서비스를 멈춘 뒤에도 포트를 쥐고 있는 옛 데몬을 거둔다.
 *
 * 데몬은 `ELECTRON_RUN_AS_NODE`로 뜬 프로세스라 winsw가 보내는 종료 요청을
 * 받지 못하고 살아남을 때가 있다. 그 프로세스가 포트를 놓지 않으면 새로 뜬
 * 데몬이 포트를 잡지 못해, 서비스를 재시작해도 옛 코드가 계속 응답한다.
 * 겉으로는 "설정 갱신"이 아무 효과가 없는 것처럼 보인다.
 *
 * 엉뚱한 프로그램을 죽이지 않도록 우리 실행 파일인지 이름으로 확인한다.
 */
function killStalePortOwner() {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$killed = @()',
    'foreach ($c in Get-NetTCPConnection -LocalPort ' + config.PORT + " -State Listen) {",
    '  $p = Get-Process -Id $c.OwningProcess',
    '  if ($null -eq $p) { continue }',
    "  if ($p.Name -notmatch '^(electron|AutoPrint)$') { continue }",
    '  Stop-Process -Id $p.Id -Force',
    '  $killed += $p.Id',
    '}',
    'Write-Output ($killed -join ",")'
  ].join('\n');

  try {
    const out = run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')
    ]).trim();

    if (out) logLine(`Killed stale daemon holding port ${config.PORT}: ${out}`);
  } catch (error) {
    logLine(`Stale port cleanup skipped: ${error.message}`);
  }
}

/**
 * 포트가 Windows 동적 포트 범위(기본 49152~65535) 안에 있으면 기록만 남긴다.
 *
 * 한때 `netsh int ipv4 add excludedportrange`로 포트를 예약했는데, 그 목록에 든
 * 포트는 동적 할당에서 빠질 뿐 아니라 **명시적 bind까지 거부된다**. 그래서 예약하는
 * 순간 서비스가 포트를 잡지 못하고 재시작을 반복했다. 예약은 해답이 아니다.
 *
 * 이 범위의 포트는 다른 프로그램이 임시 포트로 먼저 가져갈 수 있다. 확실히 피하려면
 * 포트를 49152 미만으로 바꾸는 방법뿐이라, 여기서는 로그로만 알린다.
 */
function warnIfInDynamicPortRange() {
  try {
    const out = run('netsh.exe', ['int', 'ipv4', 'show', 'dynamicport', 'tcp']);
    const start = /Start Port\s*:\s*(\d+)/i.exec(out) || /시작 포트\s*:\s*(\d+)/.exec(out);
    const count = /Number of Ports\s*:\s*(\d+)/i.exec(out) || /포트 수\s*:\s*(\d+)/.exec(out);
    if (!start || !count) return;

    const from = Number(start[1]);
    const to = from + Number(count[1]) - 1;

    if (config.PORT >= from && config.PORT <= to) {
      logLine(
        `Warning: port ${config.PORT} is inside the dynamic port range (${from}-${to}). ` +
        'Another program may take it first. Consider a port below ' + from + '.'
      );
    }
  } catch (error) {
    logLine(`Failed to read dynamic port range: ${error.message}`);
  }
}

/**
 * 예전 버전이 남긴 포트 예약을 거둔다.
 *
 * 예약이 남아 있으면 서비스가 포트를 bind하지 못해 계속 재시작한다.
 * 설치·갱신 때마다 지워 두어야 그 상태에서 빠져나올 수 있다.
 */
function clearStalePortReservation() {
  try {
    const out = run('netsh.exe', ['int', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp']);
    if (!out.includes(String(config.PORT))) return;

    run('netsh.exe', [
      'int', 'ipv4', 'delete', 'excludedportrange',
      'protocol=tcp', `startport=${config.PORT}`, 'numberofports=1'
    ]);
    logLine(`Removed stale port reservation for ${config.PORT} (it blocks bind).`);
  } catch (error) {
    logLine(`Port reservation cleanup skipped: ${error.message}`);
  }
}

/**
 * 방화벽 인바운드 규칙을 현재 포트에 맞춰 적용한다.
 *
 * 규칙이 없으면 서버가 0.0.0.0에 떠 있어도 다른 기기에서 접속되지 않는다.
 * 실패해도 설치 자체는 막지 않는다. 같은 PC에서는 여전히 동작하기 때문이다.
 */
function applyFirewallRule() {
  try {
    run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand',
      Buffer.from(firewall.buildApplyScript(), 'utf16le').toString('base64')
    ]);
    logLine(`Firewall rule applied for port ${config.PORT}.`);
    return true;
  } catch (error) {
    logLine(`Firewall rule failed: ${error.message}`);
    return false;
  }
}

function removeFirewallRule() {
  try {
    run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand',
      Buffer.from(firewall.buildRemoveScript(), 'utf16le').toString('base64')
    ]);
    logLine('Firewall rule removed.');
  } catch (error) {
    logLine(`Firewall rule removal skipped: ${error.message}`);
  }
}

/** 부팅 자동 시작과 장애 복구 정책을 (재)적용한다. 여러 번 실행해도 안전하다. */
function applyServicePolicy() {
  try {
    run('sc.exe', ['config', config.SCM_NAME, 'obj=', 'LocalSystem', 'start=', 'auto']);
    run('sc.exe', [
      'failure', config.SCM_NAME,
      'reset=', '86400',
      'actions=', 'restart/5000/restart/10000/restart/30000'
    ]);
  } catch (error) {
    logLine(`Failed to configure service: ${error.message}`);
  }
}

/**
 * 데몬 디렉터리의 쓰기 권한을 SYSTEM / Administrators로 제한한다.
 *
 * 서비스가 LocalSystem으로 실행되므로, 일반 사용자가 이 폴더의 winsw.exe나 XML을
 * 바꿀 수 있으면 곧바로 권한 상승 통로가 된다. 쓰기는 반드시 막아야 한다.
 * 반면 읽기는 열어둔다. 설치 실패 시 사용자가 install.log를 확인해야 하기 때문이다.
 *
 * 잘 알려진 SID를 쓰므로 한국어 Windows에서도 그룹명 번역 문제가 없다.
 */
function lockDownDirectory(dir) {
  try {
    run('icacls.exe', [
      dir,
      '/inheritance:r',
      '/grant', '*S-1-5-18:(OI)(CI)F',      // NT AUTHORITY\SYSTEM
      '/grant', '*S-1-5-32-544:(OI)(CI)F',  // BUILTIN\Administrators
      '/grant', '*S-1-5-32-545:(OI)(CI)RX'  // BUILTIN\Users — 읽기 전용
    ]);
  } catch (error) {
    logLine(`icacls failed: ${error.message}`);
  }
}

function buildService() {
  const { Service } = require('node-windows');

  const svc = new Service({
    name: config.NAME,
    description: config.DESCRIPTION,
    script: config.getDaemonScript(),
    execPath: config.getExecPath(),
    // node-windows는 이 옵션을 'workingDirectory'(대문자 D)로 읽는다.
    // 소문자로 주면 조용히 무시되고 설치 프로세스의 cwd가 박힌다.
    workingDirectory: config.DAEMON_DIR,
    stopparentfirst: true,
    stoptimeout: 15,
    nodeOptions: [],
    env: [
      { name: 'ELECTRON_RUN_AS_NODE', value: '1' },
      { name: 'AUTOPRINT_SERVICE', value: '1' }
    ]
  });

  // node-windows는 기본적으로 스크립트가 있는 폴더를 기준으로 daemon 디렉터리를
  // 잡는다. install()에만 경로를 넘기면 uninstall()이 엉뚱한 곳을 보게 되므로
  // 생성 직후 한 번 고정해 둔다.
  svc.directory(config.ROOT);

  // logOnAs를 기본값으로 두면 <user>LocalSystem</user> 과 <domain>컴퓨터이름</domain> 이
  // 함께 들어가 "<컴퓨터이름>\LocalSystem" 이라는 존재하지 않는 계정이 만들어진다.
  // null로 지우면 <serviceaccount> 블록 자체가 빠지고 winsw가 LocalSystem으로 등록한다.
  svc.logOnAs = null;

  return svc;
}

/**
 * node-windows의 uninstall()은 winsw 실행이 실패하면 어떤 이벤트도 emit하지 않는다.
 * 응답이 없을 때 영원히 매달리지 않도록 상한을 둔다.
 */
function guard(seconds, onTimeout) {
  const timer = setTimeout(onTimeout, seconds * 1000);
  timer.unref();
  return timer;
}

/**
 * node-windows 1.0.0-beta.8의 winsw.js에는 config 전체를 stdout으로 찍는
 * 디버그 console.log가 남아 있다. 설치 로그를 어지럽히므로 막는다.
 */
function withSilencedConsole(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = original;
  }
}

/**
 * 이 설치를 실행한 사용자의 SID.
 *
 * UAC로 승격됐어도 계정은 그대로이므로 여기서 읽은 SID가 실제 사용자의 것이다.
 * 데몬은 이 SID로 HKEY_USERS를 뒤져 사용자의 현재 기본 프린터를 따라간다.
 */
function getCurrentUserSid() {
  try {
    return run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value'
    ]).trim() || null;
  } catch (error) {
    logLine(`Failed to read user SID: ${error.message}`);
    return null;
  }
}

/**
 * 사용자의 기본 프린터와 SID를 서비스에 물려준다.
 *
 * 서비스는 LocalSystem으로 실행되는데 기본 프린터는 사용자별(HKCU) 설정이라
 * 서비스 쪽에서는 알 수 없다. 이 설치 프로세스는 UAC로 승격됐을 뿐 여전히
 * 같은 사용자이므로, 여기서 읽어 파일에 남겨두면 데몬이 그대로 쓸 수 있다.
 *
 * 프린터 이름은 설치 시점의 값이라 곧 낡는다. 그래서 SID도 함께 남겨,
 * 데몬이 사용자가 기본 프린터를 바꿔도 따라갈 수 있게 한다.
 */
async function captureDefaultPrinter() {
  const userSid = getCurrentUserSid();

  let name = null;
  try {
    const def = await require('pdf-to-printer').getDefaultPrinter();
    name = def && def.name ? def.name : null;
  } catch (error) {
    // 읽기 실패는 치명적이지 않다. 데몬이 SID로 다시 확인한다.
    logLine(`Failed to read default printer: ${error.message}`);
  }

  if (!name) {
    logLine('No default printer configured for this user.');
  }

  try {
    fs.writeFileSync(
      config.SETTINGS_FILE,
      JSON.stringify({ defaultPrinter: name, userSid }, null, 2),
      'utf8'
    );
    logLine(`Captured settings (printer: ${name || 'none'}, sid: ${userSid || 'none'})`);
    return { ok: true, printer: name };
  } catch (error) {
    logLine(`Failed to write settings: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function installService() {
  // 이전 설치가 실패해 파일만 남은 경우, node-windows가 'alreadyinstalled'로
  // 오판하므로 SCM 기준으로 판단해 정리한다.
  if (!serviceExistsInScm() && fs.existsSync(config.DAEMON_DIR)) {
    fs.rmSync(config.DAEMON_DIR, { recursive: true, force: true });
    logLine('Cleaned up stale daemon directory.');
  }

  fs.mkdirSync(config.DAEMON_DIR, { recursive: true });
  await captureDefaultPrinter();
  lockDownDirectory(config.ROOT);

  // 이전 설치의 데몬이 포트를 쥔 채 남아 있으면 새 데몬이 뜨지 못한다.
  killStalePortOwner();

  // 예전 버전이 남긴 포트 예약을 걷어내야 서비스가 포트를 잡을 수 있다.
  clearStalePortReservation();
  warnIfInDynamicPortRange();
  applyFirewallRule();

  const svc = buildService();

  svc.on('alreadyinstalled', () => finish({ ok: false, error: '이미 설치되어 있습니다.' }));
  svc.on('invalidinstallation', () => finish({ ok: false, error: '설치 파일이 손상되었습니다.' }));

  svc.on('install', () => {
    if (!serviceExistsInScm()) {
      return finish({
        ok: false,
        error: `서비스 등록에 실패했습니다. ${path.join(config.ROOT, 'install.log')} 를 확인해 주세요.`
      });
    }

    // LocalSystem 실행 + 부팅 시 자동 시작 + 비정상 종료 시 자동 복구를 명시한다.
    applyServicePolicy();

    // 등록 직후 바로 기동한다.
    execFile('sc.exe', ['start', config.SCM_NAME], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || stdout || error.message).toString().trim();
        logLine(`sc start failed: ${detail}`);
        return finish({
          ok: false,
          installed: true,
          error: `서비스는 등록되었지만 시작하지 못했습니다. ${path.join(config.ROOT, 'install.log')} 를 확인해 주세요.`
        });
      }
      finish({ ok: true, installed: true });
    });
  });

  withSilencedConsole(() => svc.install(config.ROOT));
}

/**
 * 재등록 없이 설정만 다시 적용한다.
 *
 * - 사용자의 현재 기본 프린터를 다시 읽어 settings.json에 기록
 * - 폴더 권한 재적용 (이전 버전에서 읽기 권한이 없던 경우 복구)
 * - 자동 시작 / 장애 복구 정책 재적용
 *
 * 데몬은 시작할 때 settings.json을 읽으므로, 실행 중이었다면 다시 띄워야 반영된다.
 */
async function refreshService() {
  if (!serviceExistsInScm()) {
    return finish({ ok: false, error: '서비스가 등록되어 있지 않습니다.' });
  }

  const wasRunning = getServiceState() === 'Running';

  fs.mkdirSync(config.DAEMON_DIR, { recursive: true });

  const captured = await captureDefaultPrinter();
  if (!captured.ok) {
    return finish({ ok: false, error: `설정 파일을 쓰지 못했습니다: ${captured.error}` });
  }

  lockDownDirectory(config.ROOT);
  applyServicePolicy();
  // 예전 버전이 남긴 포트 예약을 걷어내고, 방화벽을 현재 포트에 맞춘다.
  clearStalePortReservation();
  warnIfInDynamicPortRange();
  applyFirewallRule();

  if (!wasRunning) {
    logLine('Settings refreshed; service was not running, leaving it stopped.');
    return finish({
      ok: true, installed: true, restarted: false, defaultPrinter: captured.printer
    });
  }

  try {
    run('sc.exe', ['stop', config.SCM_NAME]);
  } catch (error) {
    logLine(`sc stop during refresh failed: ${error.message}`);
  }

  if (!waitForStopped()) {
    return finish({
      ok: false,
      error: '서비스를 멈추지 못해 설정을 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    });
  }

  // 서비스는 멈췄어도 데몬이 포트를 쥔 채 남아 있으면 새 데몬이 뜨지 못한다.
  killStalePortOwner();

  execFile('sc.exe', ['start', config.SCM_NAME], { windowsHide: true }, (error, stdout, stderr) => {
    if (error) {
      const detail = (stderr || stdout || error.message).toString().trim();
      logLine(`sc start during refresh failed: ${detail}`);
      return finish({
        ok: false,
        error: `설정은 반영했지만 서비스를 다시 시작하지 못했습니다. ${path.join(config.ROOT, 'install.log')} 를 확인해 주세요.`
      });
    }
    finish({
      ok: true, installed: true, restarted: true, defaultPrinter: captured.printer
    });
  });
}

function uninstallService() {
  // 실행 중이면 먼저 정지한다. 이미 멈춰 있어도 무시한다.
  try {
    run('sc.exe', ['stop', config.SCM_NAME]);
  } catch (_) {
    // noop
  }

  waitForStopped(10000);
  // 등록을 지워도 데몬이 남아 포트를 계속 물고 있으면 안 된다.
  killStalePortOwner();

  const done = () => {
    // winsw가 제거하지 못했을 때를 대비한 예비 경로.
    if (serviceExistsInScm()) {
      try {
        run('sc.exe', ['delete', config.SCM_NAME]);
      } catch (error) {
        return finish({ ok: false, error: `서비스 제거 실패: ${error.message}` });
      }
    }
    try {
      fs.rmSync(config.DAEMON_DIR, { recursive: true, force: true });
    } catch (error) {
      logLine(`Failed to remove daemon directory: ${error.message}`);
    }
    clearStalePortReservation();
    removeFirewallRule();
    finish({ ok: true, installed: false });
  };

  const svc = buildService();

  const timer = guard(60, () => {
    logLine('uninstall timed out; falling back to sc delete.');
    done();
  });

  const complete = () => {
    clearTimeout(timer);
    done();
  };

  svc.on('alreadyuninstalled', complete);
  svc.on('uninstall', complete);
  svc.on('error', (error) => {
    logLine(`node-windows uninstall error: ${error && error.message}`);
    complete();
  });

  withSilencedConsole(() => svc.uninstall());
}

/** 서비스와 무관하게 방화벽만 여는 경로. 앱 시작 시 사용한다. */
function applyFirewallOnly() {
  const ok = applyFirewallRule();
  finish(ok
    ? { ok: true, firewall: true }
    : { ok: false, error: `방화벽 규칙을 적용하지 못했습니다. ${path.join(config.ROOT, 'install.log')} 를 확인해 주세요.` });
}

async function main() {
  try {
    if (action === 'firewall') {
      logLine('Applying firewall rule only');
      return applyFirewallOnly();
    }
    if (action === 'install') {
      logLine('Installing service as LocalSystem');
      await installService();
    } else if (action === 'refresh') {
      logLine('Refreshing service settings');
      await refreshService();
    } else if (action === 'uninstall') {
      logLine('Uninstalling service');
      uninstallService();
    } else {
      finish({ ok: false, error: `알 수 없는 작업: ${action}` });
    }
  } catch (error) {
    finish({ ok: false, error: error.message });
  }
}

main().catch((error) => finish({ ok: false, error: error.message }));
