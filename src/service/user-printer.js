/**
 * 로그인한 사용자의 현재 기본 프린터를 읽는다.
 *
 * 서비스는 LocalSystem으로 돌기 때문에 자기 HKCU를 봐도 사용자의 설정이 없다.
 * 기본 프린터는 사용자별 설정이라 HKEY_USERS\<SID> 아래를 직접 봐야 한다.
 * 설치 시점에 기록해 둔 SID를 쓰며, 사용자가 기본 프린터를 바꾸면 그대로 따라간다.
 *
 * 사용자가 로그오프하면 해당 하이브가 언로드되어 읽기에 실패한다.
 * 그때는 호출하는 쪽에서 마지막으로 기록해 둔 값으로 넘어간다.
 */
const { execFile } = require('child_process');

const REG_PATH = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows';

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/**
 * 레지스트리의 Device 값은 "프린터이름,winspool,Ne00:" 형태다.
 * 프린터 이름 자체에 쉼표가 들어갈 수 있으므로 뒤에서부터 잘라낸다.
 */
function parseDeviceValue(value) {
  if (!value) return null;

  const parts = value.split(',');
  if (parts.length <= 2) return value.trim() || null;

  return parts.slice(0, parts.length - 2).join(',').trim() || null;
}

function readUserDefaultPrinter(sid) {
  if (!sid) return Promise.resolve(null);

  const regPath = 'Registry::HKEY_USERS\\' + sid + '\\' + REG_PATH;

  // reg.exe는 콘솔 코드페이지로 출력해 한글·중국어 프린터명이 깨진다.
  // PowerShell에서 출력 인코딩을 UTF-8로 고정해 읽는다.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'try {',
    "  Write-Output (Get-ItemProperty -LiteralPath '" + regPath.replace(/'/g, "''") + "' -Name Device).Device",
    '} catch {',
    '  exit 1',
    '}'
  ].join('\n');

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
       '-EncodedCommand', encodePowerShell(script)],
      { windowsHide: true, encoding: 'utf8', timeout: 10000 },
      (error, stdout) => {
        if (error) return resolve(null);
        resolve(parseDeviceValue((stdout || '').trim()));
      }
    );
  });
}

module.exports = { readUserDefaultPrinter, parseDeviceValue };
