/**
 * 인쇄 서버 포트를 Windows 방화벽에서 열어준다.
 *
 * 서버는 0.0.0.0에 바인딩하지만, 인바운드 규칙이 없으면 같은 PC에서만 접속된다.
 * 다른 기기에서 쓰려면 규칙이 반드시 있어야 한다.
 *
 * 조회는 일반 권한으로 되지만 규칙을 만들거나 고치려면 관리자 권한이 필요하다.
 * 그래서 적용은 UAC로 승격되는 installer.js 쪽에서 실행한다.
 */
const { execFile } = require('child_process');
const { PORT } = require('../shared/network');

// 포트가 바뀌어도 규칙은 하나만 유지되도록 이름을 고정한다.
const RULE_NAME = 'AutoPrint';

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
       '-EncodedCommand', encodePowerShell(script)],
      { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 20000 },
      (error, stdout, stderr) => {
        resolve({ error, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
      }
    );
  });
}

/**
 * 규칙이 있는지, 켜져 있는지, 지금 포트를 열고 있는지 확인한다.
 *
 * 규칙이 남아 있어도 포트가 예전 값이면 접속되지 않으므로 포트까지 본다.
 */
async function getStatus() {
  // -DisplayName과 -Direction은 같은 매개변수 집합이 아니라 함께 쓰면
  // "Parameter set cannot be resolved" 오류가 난다. SilentlyContinue가 그 오류를
  // 삼키면 규칙이 있어도 없는 것으로 보이므로, 방향은 받아온 뒤에 걸러낸다.
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    "$r = @(Get-NetFirewallRule -DisplayName '" + RULE_NAME + "' | Where-Object { $_.Direction -eq 'Inbound' })",
    'if ($r.Count -eq 0) {',
    '  Write-Output \'{"exists":false}\'',
    '} else {',
    '  $ports = @($r | Get-NetFirewallPortFilter | ForEach-Object { $_.LocalPort })',
    '  [pscustomobject]@{',
    '    exists  = $true',
    '    enabled = [bool]($r | Where-Object { $_.Enabled -eq \'True\' })',
    '    allow   = [bool]($r | Where-Object { $_.Action -eq \'Allow\' })',
    '    ports   = $ports',
    '  } | ConvertTo-Json -Compress',
    '}'
  ].join('\n');

  const { stdout } = await runPowerShell(script);

  let status = { exists: false };
  try {
    if (stdout) status = JSON.parse(stdout);
  } catch (_) {
    status = { exists: false };
  }

  const ports = []
    .concat(status.ports === undefined || status.ports === null ? [] : status.ports)
    .map((p) => String(p));

  status.port = PORT;
  status.ports = ports;
  // 규칙이 있어도 포트가 다르면 열린 것이 아니다.
  status.open = Boolean(status.exists && status.enabled && status.allow && ports.includes(String(PORT)));

  return status;
}

/**
 * 규칙을 만들거나 현재 포트에 맞게 고친다. 관리자 권한이 필요하다.
 * 여러 번 실행해도 결과가 같도록, 기존 규칙은 지우고 다시 만든다.
 */
function buildApplyScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    // 이름이 같은 규칙이 여러 개 쌓이지 않도록 먼저 정리한다.
    "Get-NetFirewallRule -DisplayName '" + RULE_NAME + "' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue",
    'New-NetFirewallRule ' +
      "-DisplayName '" + RULE_NAME + "' " +
      "-Description 'AutoPrint 인쇄 서버 인바운드 허용' " +
      '-Direction Inbound -Action Allow -Enabled True ' +
      '-Protocol TCP -LocalPort ' + PORT + ' ' +
      '-Profile Any | Out-Null'
  ].join('\n');
}

/** 등록 해제 시 규칙도 함께 거둔다. */
function buildRemoveScript() {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "Get-NetFirewallRule -DisplayName '" + RULE_NAME + "' | Remove-NetFirewallRule"
  ].join('\n');
}

module.exports = {
  RULE_NAME,
  getStatus,
  buildApplyScript,
  buildRemoveScript,
  runPowerShell
};
