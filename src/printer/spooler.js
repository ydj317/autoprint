/**
 * Windows 인쇄 스풀러에 물어보는 유틸.
 *
 * SumatraPDF는 작업을 스풀러에 넘기면 바로 종료 코드 0을 준다. 그래서 종료 코드만
 * 보고 "인쇄 완료"라고 답하면, 정작 스풀러에서 실패해도 성공이라고 알리게 된다.
 * 실제로 가상 프린터(PDF 저장)로 보낸 작업이 세션 0에서 대화상자를 띄우지 못해
 * `Error, Retained` 상태로 멈추는데도 완료로 보고되는 문제가 있었다.
 *
 * 여기서 큐를 직접 확인해 결과를 판별한다.
 */
const { execFile } = require('child_process');

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
       '-EncodedCommand', encodePowerShell(script)],
      { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: timeoutMs },
      (error, stdout) => resolve({ error, stdout: (stdout || '').trim() })
    );
  });
}

/**
 * 저장 위치를 묻는 포트인지 판별한다.
 *
 * 이런 프린터는 인쇄할 때 대화상자가 떠야 끝난다. 서비스는 세션 0에서 돌아
 * 데스크톱이 없으므로 그 대화상자를 띄울 수 없고, 작업이 큐에 멈춘다.
 * 사람이 직접 쓰는 앱에서는 잘 되기 때문에 원인을 찾기 어렵다.
 */
function needsDesktop(portName) {
  if (!portName) return false;

  const port = String(portName).toUpperCase();
  return (
    port === 'PORTPROMPT:' ||       // Microsoft Print to PDF
    port.startsWith('FILE:') ||     // 파일로 출력
    port.includes('KINGSOFT') ||    // WPS Print to PDF
    port.includes('ONENOTE') ||
    port.includes('MICROSOFT.OFFICE.ONENOTE')
  );
}

/** 프린터 이름 → 포트 이름. 어떤 프린터가 데스크톱을 필요로 하는지 판별하는 데 쓴다. */
async function getPrinterPorts() {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '@(Get-Printer | ForEach-Object { [pscustomobject]@{ name = $_.Name; port = $_.PortName } })' +
      ' | ConvertTo-Json -Compress'
  ].join('\n');

  const { stdout } = await runPowerShell(script);

  try {
    if (!stdout) return [];
    const parsed = JSON.parse(stdout);
    // 프린터가 하나면 배열이 아니라 객체로 온다.
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_) {
    return [];
  }
}

/**
 * 방금 보낸 작업이 스풀러에서 어떻게 됐는지 지켜본다.
 *
 * 작업이 큐에서 사라지면 정상 처리된 것으로 본다. `Error`가 붙으면 실패다.
 * 시간 안에 결론이 나지 않으면 아직 처리 중이라는 뜻이라 실패로 단정하지 않는다.
 *
 * @param {string} printerName 인쇄를 보낸 프린터
 * @param {string} documentName 스풀러에 보이는 문서 이름 (보통 파일 경로)
 */
async function watchJob(printerName, documentName, timeoutMs = 4000) {
  // 스풀러의 DocumentName은 보통 역슬래시 전체 경로다. 넘어온 경로가 슬래시를
  // 쓰면 그대로 비교했을 때 영영 일치하지 않아, 실패한 작업도 못 보고 지나친다.
  // 파일 이름만으로 맞춘다. 임시 파일 이름에 타임스탬프와 난수가 있어 겹치지 않는다.
  const baseName = String(documentName).replace(/\\/g, '/').split('/').pop();

  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    `$deadline = (Get-Date).AddMilliseconds(${timeoutMs})`,
    '$seen = $false',
    '$status = $null',
    'while ((Get-Date) -lt $deadline) {',
    `  $job = Get-PrintJob -PrinterName ${psQuote(printerName)} |` +
      ` Where-Object { $_.DocumentName -like ${psQuote('*' + baseName)} } | Select-Object -First 1`,
    '  if ($null -eq $job) {',
    // 한 번이라도 큐에서 본 뒤 사라졌다면 처리가 끝난 것이다.
    '    if ($seen) { $status = "done"; break }',
    '  } else {',
    '    $seen = $true',
    '    if ($job.JobStatus -match "Error|Blocked|Offline|PaperOut|UserIntervention") {',
    '      $status = "error:" + $job.JobStatus',
    '      break',
    '    }',
    '  }',
    '  Start-Sleep -Milliseconds 250',
    '}',
    'if ($null -eq $status) { if ($seen) { $status = "pending" } else { $status = "done" } }',
    'Write-Output $status'
  ].join('\n');

  const { stdout } = await runPowerShell(script, timeoutMs + 10000);
  const result = stdout || 'unknown';

  if (result.startsWith('error:')) {
    return { ok: false, state: 'error', detail: result.slice('error:'.length) };
  }
  if (result === 'pending') {
    return { ok: true, state: 'pending' };
  }
  return { ok: true, state: 'done' };
}

module.exports = { needsDesktop, getPrinterPorts, watchJob };
