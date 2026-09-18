/**
 * 한국어 / 중국어(간체) 문구 사전.
 *
 * 관리 앱(src/ui)과 웹 인쇄 페이지(public)가 같은 문구를 써야 하므로 여기에 모은다.
 * 앱은 이 파일을 직접 require하고, 웹 페이지는 서버의 /api/i18n으로 받아 간다.
 *
 * 문구 안의 {name}은 값이 끼워지는 자리다. translate()가 채운다.
 */

const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' }
];

const DEFAULT_LANGUAGE = 'ko';

const MESSAGES = {
  ko: {
    /* ---------------------------------------------------------- 관리 앱 */
    'app.help': '도움말',
    'app.close': '닫기',
    'app.language': '언어',

    'card.server': '인쇄 서버 상태',
    'card.service': 'Windows 서비스',
    'card.firewall': '방화벽',

    'common.checking': '확인 중…',
    'common.none': '없음',

    'server.running': '서비스로 실행 중 (포트 {port})',
    'server.foreign': '포트 {port}에 응답하는 다른 프로그램이 있습니다 — 서비스가 아닙니다',
    'server.portBusy': '포트 {port}가 다른 프로그램에 점유되어 있습니다',
    'server.noResponse': '서비스는 실행 중이지만 응답이 없습니다',
    'server.stopped': '중지됨 — 서비스를 시작해 주세요',
    'server.notInstalled': '중지됨 — 서비스를 등록해야 인쇄 서버가 동작합니다',

    'service.notInstalled': '서비스 등록 안 됨',
    'service.registered': '서비스 등록됨 — 실행 중',
    'service.noResponse': '서비스 실행 중이지만 응답이 없습니다',
    'service.stopped': '서비스 등록됨 — 정지됨{state}',
    'service.installFailed': '서비스 등록 실패',
    'service.account': '실행 계정',
    'service.startMode': '시작 유형',
    'service.startModeAuto': '자동 (부팅 시 시작)',
    'service.defaultPrinter': '기본 프린터',
    'service.hint':
      '인쇄 서버는 이 서비스로만 동작합니다. 등록하기 전에는 앱을 켜 두어도 접속할 수 없습니다. ' +
      '등록하면 앱을 꺼도, 컴퓨터를 다시 시작해도 계속 동작합니다. 등록할 때 관리자 권한 확인 창이 한 번 뜹니다.',

    'btn.install': '서비스 등록하기',
    'btn.start': '시작',
    'btn.stop': '정지',
    'btn.refresh': '설정 갱신',
    'btn.uninstall': '등록 해제',
    'btn.openFirewall': '방화벽 열기',

    'busy.elevating': '관리자 권한을 요청하는 중입니다… 확인 창에서 "예"를 눌러 주세요.',
    'busy.elevatingShort': '관리자 권한을 요청하는 중입니다…',
    'busy.starting': '서비스를 시작하는 중입니다…',
    'busy.stopping': '서비스를 정지하는 중입니다…',
    'busy.firewall': '방화벽 규칙을 적용하는 중입니다…',

    'msg.installed':
      '서비스 등록이 완료됐습니다.\n이제 이 앱을 닫아도 인쇄 서버가 계속 동작하며, 컴퓨터를 다시 시작해도 자동으로 시작됩니다.',
    'msg.installFailed': '서비스 등록 실패\n{error}',
    'msg.refreshedRestarted': '설정을 다시 적용하고 서비스를 재시작했습니다.',
    'msg.refreshed': '설정을 다시 적용했습니다. 서비스를 시작하면 반영됩니다.',
    'msg.refreshPrinter': '\n기본 프린터: {printer}',
    'msg.refreshNoPrinter': '\n이 계정에 기본 프린터가 지정되어 있지 않아, 서비스가 목록의 첫 번째를 사용합니다.',
    'msg.refreshFailed': '설정 갱신 실패\n{error}',
    'msg.uninstalled':
      '서비스 등록을 해제했습니다.\n인쇄 서버가 중지되어 더 이상 접속할 수 없습니다. 다시 사용하려면 서비스를 등록해 주세요.',
    'msg.uninstallFailed': '등록 해제 실패\n{error}',
    'msg.started': '서비스를 시작했습니다.',
    'msg.stopped': '서비스를 정지했습니다.',
    'msg.unknownError': '알 수 없는 오류',

    'printer.missingTitle': '서비스가 인식하지 못한 프린터가 있습니다:',
    'printer.missingHint':
      '서비스는 시스템 계정으로 실행되므로 사용자 계정에만 추가된 네트워크 프린터는 보이지 않습니다. ' +
      '해당 프린터를 이 컴퓨터에 직접 설치하면 서비스에서도 인식됩니다.',

    'firewall.open': '열림 — 다른 기기에서 접속할 수 있습니다',
    'firewall.closed': '닫힘 — 이 컴퓨터에서만 접속됩니다',
    'firewall.wrongPort': '규칙은 있으나 포트가 다릅니다 — 다시 열어 주세요',
    'firewall.opened': '방화벽을 열었습니다. 이제 다른 기기에서 접속할 수 있습니다.',
    'firewall.failed': '방화벽을 열지 못했습니다.\n{error}',
    'firewall.cancelled': '방화벽 열기가 취소되었습니다. 다른 기기에서는 접속할 수 없습니다.',

    'help.port': '서비스 포트',
    'help.library': '인쇄 라이브러리',
    'help.note':
      '인쇄 서버는 Windows 서비스로만 동작합니다. 서비스를 등록하지 않으면 앱을 켜 두어도 접속할 수 없습니다.',
    'help.access': '다른 컴퓨터에서는 {url} 로 접속합니다.',

    /* ------------------------------------------------------ 웹 인쇄 페이지 */
    'web.subtitle': 'PDF 파일을 업로드하면 즉시 인쇄됩니다',
    'web.dropHint': '클릭하거나 PDF 파일을 여기에 드래그하세요',
    'web.optionsLabel': '인쇄 옵션 (JSON, 선택사항)',
    'web.optionsPlaceholder': '비워두면 기본 프린터와 기본 옵션으로 인쇄합니다',
    'web.print': '인쇄',
    'web.printing': '인쇄 중...',
    'web.onlyPdf': 'PDF 파일만 지원합니다',
    'web.selectFile': '파일을 선택해주세요',
    'web.invalidJson': '옵션 JSON 형식이 올바르지 않습니다',
    'web.printQueued': '인쇄 요청이 완료되었습니다',
    'web.printFailed': '인쇄 실패',
    'web.connectionError': '연결 오류: {error}',

    'web.printers': '프린터 목록',
    'web.printersEmpty': '사용 가능한 프린터가 없습니다',
    'web.printerDefault': '기본',
    'web.printerUse': '이 프린터로 설정',
    'web.printerUnusable': '사용 불가',
    'web.printerUnusableHint':
      '저장 위치를 묻는 가상 프린터라 서비스에서는 인쇄가 끝나지 않습니다. 실제 프린터를 사용해 주세요.',
    'web.paperSizes': '지원 용지',

    'web.options': '인쇄 옵션',
    'web.optionName': '옵션',
    'web.optionValues': '값',
    'web.optionDesc': '설명',
    'web.sample': '예시',

    'web.api': 'API 사용법',
    'web.apiPrintDesc': 'PDF 파일을 업로드해 인쇄합니다. multipart/form-data로 보냅니다.',
    'web.apiPrintersDesc': '사용 가능한 프린터 목록과 기본 프린터를 돌려줍니다.',
    'web.apiOptionsDesc': '기본 인쇄 옵션을 돌려줍니다.',
    'web.apiInfoDesc': '서버의 IP 주소와 접속 URL을 돌려줍니다.',
    'web.apiResponse': '응답',
    'web.loadFailed': '정보를 불러오지 못했습니다',

    'opt.printer': '인쇄할 프린터 이름. 비우면 시스템 기본 프린터를 씁니다.',
    'opt.copies': '인쇄 매수.',
    'opt.paperSize': '용지 크기. 프린터가 지원하는 이름이어야 합니다.',
    'opt.orientation': '용지 방향. portrait는 세로, landscape는 가로입니다.',
    'opt.color': '컬러 또는 흑백.',
    'opt.sides': '단면 또는 양면. two-sided-long은 긴 쪽, two-sided-short는 짧은 쪽을 기준으로 뒤집습니다.',
    'opt.pages': '인쇄할 페이지 범위. 예: 1-3, 2, 1-3,7',
    'opt.scale': '배율. noscale은 원본 크기, shrink는 넘칠 때만 축소, fit은 용지에 맞춤.'
  },

  zh: {
    /* ---------------------------------------------------------- 管理应用 */
    'app.help': '帮助',
    'app.close': '关闭',
    'app.language': '语言',

    'card.server': '打印服务器状态',
    'card.service': 'Windows 服务',
    'card.firewall': '防火墙',

    'common.checking': '检查中…',
    'common.none': '无',

    'server.running': '以服务方式运行中（端口 {port}）',
    'server.foreign': '端口 {port} 上有其他程序在响应 — 不是本服务',
    'server.portBusy': '端口 {port} 已被其他程序占用',
    'server.noResponse': '服务正在运行，但没有响应',
    'server.stopped': '已停止 — 请启动服务',
    'server.notInstalled': '已停止 — 需要注册服务，打印服务器才能工作',

    'service.notInstalled': '服务未注册',
    'service.registered': '服务已注册 — 运行中',
    'service.noResponse': '服务正在运行，但没有响应',
    'service.stopped': '服务已注册 — 已停止{state}',
    'service.installFailed': '服务注册失败',
    'service.account': '运行账户',
    'service.startMode': '启动类型',
    'service.startModeAuto': '自动（开机启动）',
    'service.defaultPrinter': '默认打印机',
    'service.hint':
      '打印服务器只通过该服务运行。注册之前，即使打开本应用也无法连接。' +
      '注册后，即使关闭应用或重启电脑也会继续运行。注册时会弹出一次管理员权限确认窗口。',

    'btn.install': '注册服务',
    'btn.start': '启动',
    'btn.stop': '停止',
    'btn.refresh': '刷新设置',
    'btn.uninstall': '取消注册',
    'btn.openFirewall': '打开防火墙',

    'busy.elevating': '正在请求管理员权限…请在确认窗口中点击“是”。',
    'busy.elevatingShort': '正在请求管理员权限…',
    'busy.starting': '正在启动服务…',
    'busy.stopping': '正在停止服务…',
    'busy.firewall': '正在应用防火墙规则…',

    'msg.installed':
      '服务注册完成。\n现在即使关闭本应用，打印服务器也会继续运行；重启电脑后会自动启动。',
    'msg.installFailed': '服务注册失败\n{error}',
    'msg.refreshedRestarted': '已重新应用设置并重启服务。',
    'msg.refreshed': '已重新应用设置。启动服务后生效。',
    'msg.refreshPrinter': '\n默认打印机：{printer}',
    'msg.refreshNoPrinter': '\n该账户未设置默认打印机，服务将使用列表中的第一台。',
    'msg.refreshFailed': '刷新设置失败\n{error}',
    'msg.uninstalled':
      '已取消服务注册。\n打印服务器已停止，无法再连接。如需继续使用，请重新注册服务。',
    'msg.uninstallFailed': '取消注册失败\n{error}',
    'msg.started': '服务已启动。',
    'msg.stopped': '服务已停止。',
    'msg.unknownError': '未知错误',

    'printer.missingTitle': '有服务未能识别的打印机：',
    'printer.missingHint':
      '服务以系统账户运行，因此只添加到用户账户的网络打印机不可见。' +
      '将该打印机直接安装到这台电脑后，服务也能识别。',

    'firewall.open': '已开放 — 其他设备可以连接',
    'firewall.closed': '已关闭 — 只能从本机连接',
    'firewall.wrongPort': '规则存在，但端口不一致 — 请重新开放',
    'firewall.opened': '已开放防火墙。现在其他设备可以连接了。',
    'firewall.failed': '未能开放防火墙。\n{error}',
    'firewall.cancelled': '已取消开放防火墙。其他设备将无法连接。',

    'help.port': '服务端口',
    'help.library': '打印库',
    'help.note':
      '打印服务器只通过 Windows 服务运行。未注册服务时，即使打开本应用也无法连接。',
    'help.access': '在其他电脑上通过 {url} 连接。',

    /* ------------------------------------------------------ 网页打印页面 */
    'web.subtitle': '上传 PDF 文件即可立即打印',
    'web.dropHint': '点击或将 PDF 文件拖到这里',
    'web.optionsLabel': '打印选项（JSON，可选）',
    'web.optionsPlaceholder': '留空则使用默认打印机和默认选项打印',
    'web.print': '打印',
    'web.printing': '正在打印...',
    'web.onlyPdf': '仅支持 PDF 文件',
    'web.selectFile': '请选择文件',
    'web.invalidJson': '选项 JSON 格式不正确',
    'web.printQueued': '打印请求已提交',
    'web.printFailed': '打印失败',
    'web.connectionError': '连接错误：{error}',

    'web.printers': '打印机列表',
    'web.printersEmpty': '没有可用的打印机',
    'web.printerDefault': '默认',
    'web.printerUse': '设为此打印机',
    'web.printerUnusable': '不可用',
    'web.printerUnusableHint':
      '这是需要选择保存位置的虚拟打印机，在服务中无法完成打印。请使用实体打印机。',
    'web.paperSizes': '支持的纸张',

    'web.options': '打印选项',
    'web.optionName': '选项',
    'web.optionValues': '取值',
    'web.optionDesc': '说明',
    'web.sample': '示例',

    'web.api': 'API 用法',
    'web.apiPrintDesc': '上传 PDF 文件进行打印。使用 multipart/form-data 发送。',
    'web.apiPrintersDesc': '返回可用打印机列表和默认打印机。',
    'web.apiOptionsDesc': '返回默认打印选项。',
    'web.apiInfoDesc': '返回服务器的 IP 地址和访问 URL。',
    'web.apiResponse': '响应',
    'web.loadFailed': '无法加载信息',

    'opt.printer': '要使用的打印机名称。留空则使用系统默认打印机。',
    'opt.copies': '打印份数。',
    'opt.paperSize': '纸张大小。必须是打印机支持的名称。',
    'opt.orientation': '纸张方向。portrait 为纵向，landscape 为横向。',
    'opt.color': '彩色或黑白。',
    'opt.sides': '单面或双面。two-sided-long 沿长边翻转，two-sided-short 沿短边翻转。',
    'opt.pages': '要打印的页码范围。例如：1-3、2、1-3,7',
    'opt.scale': '缩放。noscale 为原始大小，shrink 仅在超出时缩小，fit 适应纸张。'
  }
};

/** 지원하지 않는 코드가 들어오면 기본 언어로 떨어뜨린다. */
function normalize(language) {
  if (!language) return DEFAULT_LANGUAGE;

  const lower = String(language).toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ko')) return 'ko';
  return DEFAULT_LANGUAGE;
}

/**
 * 문구를 찾아 {name} 자리를 채운다.
 * 사전에 없는 키는 키 자체를 돌려준다. 빈 화면보다 낫고 빠뜨린 곳이 눈에 띈다.
 */
function translate(language, key, params) {
  const lang = normalize(language);
  const table = MESSAGES[lang] || MESSAGES[DEFAULT_LANGUAGE];
  const text = table[key] !== undefined ? table[key] : MESSAGES[DEFAULT_LANGUAGE][key];

  if (text === undefined) return key;
  if (!params) return text;

  return text.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name])
  );
}

module.exports = {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  MESSAGES,
  normalize,
  translate
};
