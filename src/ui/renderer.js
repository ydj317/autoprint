const { ipcRenderer } = require('electron');
const i18n = require('../shared/i18n');

// 포트는 main 프로세스(src/shared/network.js)가 알려준다.
// 여기에 값을 적어두면 포트를 바꿀 때 고쳐야 할 곳이 하나 늘어나므로 비워 둔다.
let SERVER_URL = '';
let servicePort = null;
let busy = false;
let language = i18n.DEFAULT_LANGUAGE;

// 마지막으로 받은 상태. 언어를 바꿀 때 다시 그리는 데 쓴다.
let lastServiceStatus = null;
let lastFirewallStatus = null;

// UAC를 한 번 거절한 뒤에도 계속 창을 띄우면 성가시다. 이 실행에서는 다시 묻지 않는다.
let firewallPromptDone = false;

const LANG_STORAGE_KEY = 'autoprint.language';

function t(key, params) {
  return i18n.translate(language, key, params);
}

async function init() {
  setupLanguage();
  setupHelpModal();
  watchContentHeight();

  // 포트를 먼저 받는다. IPC 왕복이라 즉시 끝나고,
  // 뒤이어 1~2초 걸리는 서비스 조회에 이 값이 필요하다.
  await loadPort();
  await refreshService();
  await ensureFirewall();
}

/* ------------------------------------------------------------------- 언어 */

function setupLanguage() {
  const select = document.getElementById('lang-select');

  i18n.LANGUAGES.forEach((lang) => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.label;
    select.appendChild(option);
  });

  language = i18n.normalize(readStoredLanguage() || navigator.language);
  select.value = language;

  select.addEventListener('change', () => {
    language = i18n.normalize(select.value);
    storeLanguage(language);
    applyLanguage();
  });

  applyLanguage();
}

/** 저장은 편의 기능이라, 실패해도 화면은 그대로 동작해야 한다. */
function readStoredLanguage() {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch (_) {
    return null;
  }
}

function storeLanguage(value) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, value);
  } catch (_) {
    // noop
  }
}

/** 정적 문구를 채우고, 상태에서 만들어진 문구는 마지막 상태로 다시 그린다. */
function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'ko';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });

  updateHelpAccess();

  if (lastServiceStatus) {
    renderServerState(lastServiceStatus);
    renderService(lastServiceStatus);
  }
  if (lastFirewallStatus) {
    renderFirewall(lastFirewallStatus);
  }
}

/* ------------------------------------------------------------------ 도움말 */

function setupHelpModal() {
  const overlay = document.getElementById('help-overlay');
  const open = () => overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');

  document.getElementById('help-open').addEventListener('click', open);
  document.getElementById('help-close').addEventListener('click', close);

  // 바깥 여백을 눌렀을 때만 닫는다. 팝업 안쪽 클릭까지 닫히면 불편하다.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

function updateHelpAccess() {
  if (servicePort === null) return;
  document.getElementById('help-access').textContent =
    t('help.access', { url: `http://[IP]:${servicePort}` });
}

/** 서비스가 쓰는 포트를 main에서 받아 화면과 조회 주소에 반영한다. */
async function loadPort() {
  try {
    servicePort = await ipcRenderer.invoke('service-port');
    SERVER_URL = `http://localhost:${servicePort}`;
    document.getElementById('service-port').textContent = servicePort;
    updateHelpAccess();
  } catch (error) {
    console.error('Failed to load service port:', error);
  }
}

/* --------------------------------------------------------------- 창 크기 */

/**
 * 창 높이를 콘텐츠에 맞춘다.
 *
 * 서비스 상태에 따라 카드 안의 줄 수와 버튼 수가 달라지고, 프린터 경고는 길이가
 * 제각각이다. 창을 고정해 두면 어떤 값으로 잡아도 어느 상태에서는 스크롤이 생기고
 * 다른 상태에서는 빈 공간이 남는다. 그래서 바뀔 때마다 실제 높이를 알려준다.
 *
 * 도움말 팝업은 position:fixed라 이 높이에 영향을 주지 않는다.
 */
function watchContentHeight() {
  let lastHeight = 0;

  const sync = () => {
    const height = Math.ceil(document.documentElement.scrollHeight);

    // 스크롤바가 생겼다 사라지며 1~2px씩 진동할 수 있어 미세한 변화는 무시한다.
    if (Math.abs(height - lastHeight) <= 2) return;

    lastHeight = height;
    ipcRenderer.send('resize-to-content', height);
  };

  new ResizeObserver(sync).observe(document.body);
  sync();
}

/* ---------------------------------------------------------------- 서버 상태 */

/**
 * 인쇄 서버는 서비스만 띄우므로, 서버 상태는 서비스 상태에서 그대로 파생된다.
 * 다만 포트가 열려 있는데 서비스가 아닌 경우를 구분해 알려준다.
 * 예전 버전의 앱이 그대로 떠 있으면 서비스 없이도 포트가 열려 혼동을 준다.
 */
function renderServerState(status) {
  if (!status) return;

  const box = document.getElementById('server-status');
  const text = document.getElementById('server-status-text');
  const port = status.port;

  if (status.running && status.reachable) {
    box.className = 'status';
    text.textContent = t('server.running', { port });
  } else if (status.reachable) {
    box.className = 'status warn';
    text.textContent = t('server.foreign', { port });
  } else if (status.portOpen) {
    box.className = 'status warn';
    text.textContent = t('server.portBusy', { port });
  } else if (status.running) {
    box.className = 'status warn';
    text.textContent = t('server.noResponse');
  } else if (status.installed) {
    box.className = 'status error';
    text.textContent = t('server.stopped');
  } else {
    box.className = 'status error';
    text.textContent = t('server.notInstalled');
  }
}

/* -------------------------------------------------------------- 서비스 상태 */

/**
 * 서비스는 LocalSystem으로 돌기 때문에, 사용자 계정에만 연결된 네트워크 프린터는
 * 보이지 않을 수 있다. 앱이 보는 목록과 비교해 빠진 프린터를 알려준다.
 */
async function checkPrinterVisibility() {
  const box = document.getElementById('printer-warning');
  box.className = 'message hidden';
  box.textContent = '';

  // 접속 주소를 아직 받지 못했으면 조회할 곳이 없다.
  if (!SERVER_URL) return;

  let servicePrinters;
  try {
    const res = await fetch(`${SERVER_URL}/api/printers`);
    const data = await res.json();
    servicePrinters = data.printers || [];
    document.getElementById('service-default-printer').textContent =
      data.defaultPrinter || '-';
  } catch (_) {
    return;
  }

  const systemPrinters = await ipcRenderer.invoke('system-printers');
  const missing = systemPrinters.filter((name) => !servicePrinters.includes(name));

  if (missing.length === 0) return;

  box.className = 'message warn';
  box.textContent =
    `${t('printer.missingTitle')}\n${missing.map((n) => `• ${n}`).join('\n')}\n\n` +
    t('printer.missingHint');
}

function setMessage(kind, text) {
  const el = document.getElementById('service-message');
  if (!text) {
    el.className = 'message hidden';
    el.textContent = '';
    return;
  }
  el.className = `message ${kind}`;
  el.textContent = text;
}

function makeButton(label, variant, onClick) {
  const btn = document.createElement('button');
  btn.className = variant ? `action ${variant}` : 'action';
  btn.textContent = label;
  btn.disabled = busy;
  btn.addEventListener('click', onClick);
  return btn;
}

async function refreshService() {
  const status = await ipcRenderer.invoke('service:status');
  lastServiceStatus = status;
  renderServerState(status);
  renderService(status);
  return status;
}

function renderService(status) {
  const box = document.getElementById('service-status');
  const text = document.getElementById('service-status-text');
  const detail = document.getElementById('service-detail');
  const form = document.getElementById('service-form');
  const buttons = document.getElementById('service-buttons');

  buttons.innerHTML = '';

  if (status.running && status.reachable) {
    checkPrinterVisibility();
  } else {
    const warning = document.getElementById('printer-warning');
    warning.className = 'message hidden';
    warning.textContent = '';
  }

  if (!status.installed) {
    box.className = 'status neutral';
    text.textContent = t('service.notInstalled');
    detail.classList.add('hidden');
    form.classList.remove('hidden');
    buttons.appendChild(makeButton(t('btn.install'), null, onInstall));
    return;
  }

  form.classList.add('hidden');
  detail.classList.remove('hidden');
  document.getElementById('service-account').textContent = status.account || '-';
  document.getElementById('service-startmode').textContent =
    status.startMode === 'Auto' ? t('service.startModeAuto') : status.startMode || '-';

  if (status.running && status.reachable) {
    box.className = 'status';
    text.textContent = t('service.registered');
  } else if (status.running) {
    // 서비스는 떠 있는데 포트가 응답하지 않는 상태.
    box.className = 'status warn';
    text.textContent = t('service.noResponse');
  } else {
    box.className = 'status warn';
    text.textContent = t('service.stopped', { state: status.state ? ` (${status.state})` : '' });
  }

  if (status.running) {
    buttons.appendChild(makeButton(t('btn.stop'), 'secondary', onStop));
  } else {
    buttons.appendChild(makeButton(t('btn.start'), null, onStart));
  }
  buttons.appendChild(makeButton(t('btn.refresh'), 'secondary', onRefresh));
  buttons.appendChild(makeButton(t('btn.uninstall'), 'danger', onUninstall));
}

/* --------------------------------------------------------------- 방화벽 */

/**
 * 규칙이 없으면 서버가 떠 있어도 다른 기기에서 접속되지 않는다.
 * 그래서 앱을 켤 때 확인하고, 닫혀 있으면 한 번 권한을 요청해 열어준다.
 */
async function ensureFirewall() {
  const status = await refreshFirewall();

  if (status.open || firewallPromptDone) return status;

  firewallPromptDone = true;
  return await openFirewall();
}

async function refreshFirewall() {
  let status;
  try {
    status = await ipcRenderer.invoke('firewall:status');
  } catch (error) {
    console.error('Failed to read firewall status:', error);
    status = { open: false, exists: false, port: servicePort };
  }

  lastFirewallStatus = status;
  renderFirewall(status);
  return status;
}

function renderFirewall(status) {
  const box = document.getElementById('firewall-status');
  const text = document.getElementById('firewall-status-text');
  const buttons = document.getElementById('firewall-buttons');

  buttons.innerHTML = '';

  if (status.open) {
    box.className = 'status';
    text.textContent = t('firewall.open');
    return;
  }

  box.className = 'status warn';
  // 규칙은 있는데 포트가 다른 경우와, 아예 없는 경우를 구분해 알려준다.
  text.textContent = status.exists ? t('firewall.wrongPort') : t('firewall.closed');
  buttons.appendChild(makeButton(t('btn.openFirewall'), null, onOpenFirewall));
}

function setFirewallMessage(kind, text) {
  const el = document.getElementById('firewall-message');
  if (!text) {
    el.className = 'message hidden';
    el.textContent = '';
    return;
  }
  el.className = `message ${kind}`;
  el.textContent = text;
}

async function openFirewall() {
  setFirewallMessage('info', t('busy.firewall'));

  const result = await ipcRenderer.invoke('firewall:open');
  const status = await refreshFirewall();

  if (result.ok && status.open) {
    setFirewallMessage('ok', t('firewall.opened'));
  } else if (result.cancelled) {
    setFirewallMessage('warn', t('firewall.cancelled'));
  } else {
    setFirewallMessage('error', t('firewall.failed', { error: result.error || t('msg.unknownError') }));
  }

  return status;
}

async function onOpenFirewall() {
  if (busy) return;
  busy = true;
  try {
    await openFirewall();
  } finally {
    busy = false;
  }
}

/* ------------------------------------------------------------------ 동작들 */

function setButtonsDisabled(disabled) {
  document
    .querySelectorAll('#service-buttons button')
    .forEach((b) => (b.disabled = disabled));
}

async function withBusy(pendingText, fn) {
  if (busy) return;
  busy = true;
  setButtonsDisabled(true);
  setMessage('info', pendingText);
  try {
    await fn();
  } finally {
    busy = false;
    // fn 안에서 상태를 다시 그리며 버튼이 새로 만들어졌을 수 있다.
    // 그 버튼들은 busy가 아직 true일 때 생성되어 disabled 상태이므로
    // 여기서 현재 버튼을 기준으로 다시 활성화해야 한다.
    setButtonsDisabled(false);
  }
}

async function onInstall() {
  await withBusy(t('busy.elevating'), async () => {
    const result = await ipcRenderer.invoke('service:install');
    const status = await refreshService();

    // 설치 과정에서 방화벽 규칙도 함께 적용되므로 표시를 최신화한다.
    await refreshFirewall();

    if (result.ok) {
      setMessage('ok', t('msg.installed'));
    } else if (result.cancelled) {
      setMessage('error', result.error);
    } else {
      setMessage('error', t('msg.installFailed', { error: result.error || t('msg.unknownError') }));
      if (!status.installed) {
        document.getElementById('service-status').className = 'status error';
        document.getElementById('service-status-text').textContent = t('service.installFailed');
      }
    }
  });
}

async function onRefresh() {
  await withBusy(t('busy.elevating'), async () => {
    const result = await ipcRenderer.invoke('service:refresh');
    await refreshService();
    await refreshFirewall();

    if (result.ok) {
      const printer = result.defaultPrinter
        ? t('msg.refreshPrinter', { printer: result.defaultPrinter })
        : t('msg.refreshNoPrinter');

      setMessage('ok', (result.restarted ? t('msg.refreshedRestarted') : t('msg.refreshed')) + printer);
    } else if (result.cancelled) {
      setMessage('error', result.error);
    } else {
      setMessage('error', t('msg.refreshFailed', { error: result.error || t('msg.unknownError') }));
    }
  });
}

async function onUninstall() {
  await withBusy(t('busy.elevatingShort'), async () => {
    const result = await ipcRenderer.invoke('service:uninstall');
    await refreshService();
    await refreshFirewall();

    if (result.ok) {
      setMessage('ok', t('msg.uninstalled'));
    } else {
      setMessage('error', t('msg.uninstallFailed', { error: result.error || t('msg.unknownError') }));
    }
  });
}

async function onStart() {
  await withBusy(t('busy.starting'), async () => {
    const result = await ipcRenderer.invoke('service:start');
    await refreshService();
    setMessage(result.ok ? 'ok' : 'error', result.ok ? t('msg.started') : result.error);
  });
}

async function onStop() {
  await withBusy(t('busy.stopping'), async () => {
    const result = await ipcRenderer.invoke('service:stop');
    await refreshService();
    setMessage(result.ok ? 'ok' : 'error', result.ok ? t('msg.stopped') : result.error);
  });
}

document.addEventListener('DOMContentLoaded', init);
