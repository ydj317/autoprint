# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

**AutoPrint** - Electron 기반 자동 인쇄 서비스 애플리케이션. 로컬 웹서버를 실행하여 API와 웹 인터페이스를 제공하며, 원격에서 PDF 파일을 전송받아 연결된 프린터로 자동 출력한다.

## Tech Stack

- **Runtime**: Electron (CommonJS)
- **Web Server**: Embedded HTTP server (Express)
- **Printing**: Node.js 프린팅 라이브러리

## Core Features

### 1. API Server
- 로컬 HTTP 서버 실행
- 파일 수신 및 프린트 API 제공
- 현재는 PDF만 지원, 향후 다른 파일 형식 확장 가능한 구조

### 2. Web Interface (`public/index.html`)
- 파일 업로드 및 즉시 인쇄
- 프린터 목록 (기본 프린터 표시, 지원 용지, 한 번에 옵션에 넣기)
- 인쇄 옵션 설명과 예시
- API 사용법 (요청·응답 예시)
- 한국어 / 중국어 전환

옵션 칸에 특정 프린터를 미리 적어두지 않는다. 비워두면 시스템 기본 프린터로 나간다.
예전에는 여기에 프린터 이름이 박혀 있어 늘 그 프린터로만 인쇄됐다.

### 3. Print Options

API가 받는 옵션과 기본값:

| 옵션 | 값 | 기본값 |
| --- | --- | --- |
| `printer` | 프린터 이름 | 서비스가 아는 기본 프린터 |
| `copies` | 1 이상 | 1 |
| `paperSize` | `A4`, `Letter` 등 | A4 |
| `orientation` | `portrait`, `landscape` | portrait |
| `color` | `color`, `monochrome` | color |
| `sides` | `one-sided`, `two-sided-long`, `two-sided-short` | one-sided |
| `pages` | `1-3`, `2`, `1-3,7` | 전체 |
| `scale` | `noscale`, `shrink`, `fit` | 라이브러리 기본 |

**이름 매핑에 주의한다.** pdf-to-printer는 모르는 키를 오류 없이 버린다.
이름이 한 글자만 달라도 설정이 조용히 사라지므로 `handlers/pdf.js` 한곳에서 옮긴다.

| API | pdf-to-printer |
| --- | --- |
| `sides: 'one-sided'` | `side: 'simplex'` |
| `sides: 'two-sided-long'` | `side: 'duplexlong'` |
| `color: 'monochrome'` | `monochrome: true` |

이전에는 `sides`/`color`를 그대로 넘겨 양면과 흑백이 전혀 적용되지 않았다.
확인하려면 없는 프린터로 인쇄를 걸어 오류 메시지의 `-print-settings`를 본다.

### 4. 접속 정보
- 관리 UI는 서비스 상태와 포트만 보여준다 (IP/URL 목록은 표시하지 않는다)
- 서버는 `0.0.0.0`에 바인딩하므로 외부에서 `http://<이 PC의 IP>:19190` 으로 접근한다

## Architecture

```
AutoPrint/
├── main.js                 # Electron main process (서비스 관리 UI 전용)
├── src/
│   ├── shared/             # main/renderer/service가 함께 쓰는 상수·유틸
│   │   ├── network.js      # PORT, getNetworkInfo()
│   │   └── i18n.js         # 한국어/중국어 문구 사전
│   ├── server/             # Web server & API (서비스 데몬만 사용)
│   │   ├── index.js        # Server entry
│   │   ├── routes/         # API routes
│   │   └── handlers/       # Request handlers
│   ├── printer/            # Printing logic
│   │   ├── index.js        # Printer manager
│   │   └── handlers/       # File type handlers (PDF, etc.)
│   ├── service/            # Windows 서비스 (아래 참조)
│   └── ui/                 # Renderer process (settings UI)
│       ├── index.html
│       └── renderer.js
├── public/                 # Static web files for upload interface
│   └── index.html
└── package.json
```

## Key Design Principles

### Extensibility for File Types
프린트 핸들러를 인터페이스 기반으로 설계하여 새로운 파일 형식 추가 시 기존 코드 수정 없이 확장 가능하게 구현:

```javascript
// 예시 구조
class PrintHandler {
  canHandle(fileType) { return false; }
  async print(filePath, options) { }
}

class PdfHandler extends PrintHandler {
  canHandle(fileType) { return fileType === 'application/pdf'; }
  async print(filePath, options) { /* PDF 전용 로직 */ }
}
```

### API Endpoints
- `POST /api/print` - 파일 업로드 및 인쇄 (multipart: `file`, `options`)
- `GET /api/printers` - 프린터 목록, 기본 프린터, 프린터별 지원 용지(`details`)
- `GET /api/options` - 기본 인쇄 옵션
- `GET /api/info` - 서버 IP 주소와 접속 URL
- `GET /api/i18n` - 웹 페이지가 쓰는 문구 사전

응답은 모두 `application/json; charset=utf-8`로 내려간다.
`options` JSON이 깨져 있으면 조용히 기본값으로 인쇄하지 않고 400으로 돌려준다.
업로드된 임시 파일은 인쇄 성공·실패와 무관하게 지운다.

## Development Notes

- 모든 코드는 CommonJS (`require`/`module.exports`) 사용
- 웹서버는 Windows 서비스(`src/service/daemon.js`)에서만 실행한다. main process는 띄우지 않는다
- 프린터 접근은 Windows 용 라이브러리 사용
- **빌드는 `asar: false`다.** 아래 "패키징" 참조

## 패키징 (electron-builder)

```
npm run build   →  dist/AutoPrint-Setup-1.1.0.exe
```

### asar를 쓰지 않는다

electron-builder는 "asar 비활성은 권장하지 않는다"고 경고하지만, 이 앱에서는 켤 수 없다.

데몬과 installer는 **asar 밖에서 별도 프로세스로 실행된다**(`ELECTRON_RUN_AS_NODE=1`).
Node의 모듈 탐색은 실행 파일이 있는 폴더에서 위로만 올라가고 **asar 안으로는 들어가지
못한다.** 그래서 asar를 켜면 데몬이 자기 의존성을 찾지 못한다.

```
app.asar.unpacked/src/service/daemon.js
  → require('../server') → require('express')
  → app.asar.unpacked/node_modules/express  … 없음
  → resources/node_modules                  … 없음  →  실패
```

실제로 `Cannot find module 'express'`로 데몬이 뜨지 못했고, 서비스 등록도
`svc.install()`이 조용히 죽어 `install.log`에 `Result:` 줄조차 남지 않았다.

`asarUnpack`으로 풀 수도 있지만 대상이 `express`, `multer`, `node-windows`(+`xml`,
`yargs`와 그 하위 의존성) 전체로 번져 관리가 깨지기 쉽다. 런타임 의존성이 사실상
전부이므로 `asar: false`가 단순하고 확실하다.

데몬 스크립트 위치:

```
개발       <프로젝트>/src/service/daemon.js
빌드·설치  <설치경로>/resources/app/src/service/daemon.js
```

### perMachine 설치

`C:\Program Files\AutoPrint`에 설치한다 (`nsis.perMachine: true`).

서비스는 LocalSystem으로 돌기 때문에 사용자 폴더(`%LOCALAPPDATA%\Programs`)에 두면
서비스가 특정 사용자의 프로필 경로를 물고 있게 된다. 계정이 지워지거나 프로필이
바뀌면 서비스가 깨진다. 서비스형 앱이므로 머신 공용 경로가 맞다.

### win.sign

`win.sign`에 `false`를 줄 수 없다. electron-builder 26에서 이 옵션은 커스텀 서명
스크립트 **경로**라, 불리언을 주면 빌드가 스키마 검증에서 바로 실패한다.
서명은 인증서가 없으면 알아서 건너뛰므로 옵션 자체를 두지 않는다.

### 빌드 후 확인할 것

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& dist\win-unpacked\AutoPrint.exe -e "require('<설치경로>/resources/app/src/server')"
```

데몬이 쓰는 모듈(`express`, `multer`, `pdf-to-printer`, `node-windows`)이 모두 로드되는지,
`config.getDaemonScript()`가 실제로 존재하는 파일을 가리키는지 본다.

## Windows Service Mode

앱을 닫아도, 시스템을 재시작해도 인쇄 서버가 계속 동작하도록 Windows 서비스로 등록할 수 있다.
등록 버튼을 누르면 UAC 확인 창만 뜨고, 계정/비밀번호는 묻지 않는다.

```
src/service/
├── config.js        # 서비스 이름/경로 상수
├── daemon.js        # 서비스가 실행하는 헤드리스 진입점
├── firewall.js      # 방화벽 규칙 상태 조회 + 적용 스크립트
├── installer.js     # 관리자 권한으로 실행되는 설치/제거/방화벽 헬퍼
├── manager.js       # Electron main에서 쓰는 상태 조회 + UAC 승격
└── user-printer.js  # HKEY_USERS에서 사용자의 현재 기본 프린터 읽기
```

### 실행 구조

```
services.msc: autoprint.exe (자동 시작, LocalSystem)
  └─ winsw 래퍼 (C:\ProgramData\AutoPrint\daemon\autoprint.exe)
       └─ electron.exe / AutoPrint.exe  (ELECTRON_RUN_AS_NODE=1)
            └─ src/service/daemon.js  →  0.0.0.0:19190
```

Node 프로세스는 Windows SCM과 통신하지 못하므로 서비스 래퍼가 반드시 필요하다.
node-windows가 winsw(.NET Framework 4.x)를 통해 이 역할을 한다.

### 서비스 계정

LocalSystem으로 등록한다. 서비스를 특정 사용자 계정으로 돌리려면 Windows가 LSA에
비밀번호를 요구하는데, LocalSystem은 비밀번호가 필요 없어 UAC 승인만으로 끝난다.

대신 사용자별(HKCU) 정보는 보이지 않는다. 실측 결과 두 가지가 달랐다.

- **사용자 전용 프린터가 안 보인다.** 이 PC에서는 `OneNote for Windows 10`(Store 앱
  프린터)이 서비스 목록에서 빠졌다. UI가 앱이 보는 목록과 서비스의 `/api/printers`를
  비교해 경고한다.
- **기본 프린터를 모른다.** 그냥 두면 목록 첫 번째를 쓴다. 설치 프로세스는 UAC로
  승격됐을 뿐 여전히 같은 사용자이므로, 거기서 기본 프린터를 읽어
  `daemon/settings.json`에 남기고 데몬이 이를 우선 사용한다.

### 설정 갱신 (refresh)

재등록 없이 한 번의 승격으로 다음을 다시 적용한다. `installer.js refresh`.

- 사용자의 현재 기본 프린터를 다시 읽어 `settings.json`에 기록
- 폴더 권한 재적용 (읽기 권한이 없던 이전 설치 복구)
- `start= auto` / 장애 복구 정책 재적용

데몬은 시작할 때만 `settings.json`을 읽으므로, 실행 중이었다면 재시작까지 한다.
멈춰 있었다면 그대로 두고 다음 시작 때 반영된다.

### 주의할 점 (node-windows 1.0.0-beta.8)

- **SCM 등록명은 `autoprint.exe`** 다. node-windows가 winsw XML의 `<id>`에 ID + `.exe`를
  넣기 때문. `sc.exe` / `Get-Service` 조회 시 `config.SCM_NAME`을 써야 한다.
- **`logOnAs`를 기본값으로 두면 안 된다.** 기본값이 truthy라서
  `<domain>컴퓨터이름</domain><user>LocalSystem</user>` 조합, 즉 존재하지 않는
  `<컴퓨터이름>\LocalSystem` 계정이 만들어진다. `svc.logOnAs = null`로 지우면
  `<serviceaccount>` 블록 자체가 빠지고 winsw가 LocalSystem으로 등록한다.
- 생성자 옵션 키는 **`workingDirectory`** (대문자 D). 소문자로 주면 조용히 무시되고
  설치 프로세스의 cwd가 박힌다.
- `uninstall()`은 `install(dir)`에 넘긴 경로를 기억하지 않는다. 생성 직후
  `svc.directory(ROOT)`로 고정해야 한다. 또 실패 시 어떤 이벤트도 emit하지 않으므로
  타임아웃과 `sc delete` 예비 경로가 필요하다.
- `lib/winsw.js`에 config 전체를 stdout으로 찍는 디버그 `console.log`가 남아 있다.

### 헤드리스 제약

서비스에는 BrowserWindow가 없어 `webContents.getPrintersAsync()`를 쓸 수 없다.
`PrinterManager.loadFromSystem()`이 `pdf-to-printer`로 시스템에서 직접 읽는다.

`process.resourcesPath`는 Electron에만 있다. 데몬을 순수 Node로 돌리면 undefined가
들어와 `path.join`이 그 자리에서 던지므로, `getPublicPath()`가 걸러낸다.

### 기본 프린터 추적

설치 시점의 프린터 이름만 `settings.json`에 적어두면, 사용자가 기본 프린터를 바꿔도
계속 옛 프린터로 인쇄된다. 그래서 이름과 함께 **사용자 SID**도 기록한다.

데몬은 60초마다 `HKEY_USERS\<SID>\Software\Microsoft\Windows NT\CurrentVersion\Windows`의
`Device` 값을 읽어 현재 기본 프린터를 따라간다 (`service/user-printer.js`).
값 형식은 `프린터이름,winspool,Ne00:` 이고, 이름에 쉼표가 들어갈 수 있어 뒤에서부터 자른다.

사용자가 로그오프하면 그 하이브가 언로드되어 읽기에 실패한다. 그때만 기록해 둔 이름으로
돌아간다. `reg.exe`는 콘솔 코드페이지로 출력해 한글·중국어 프린터명이 깨지므로
PowerShell에서 출력 인코딩을 UTF-8로 고정해 읽는다.

### 방화벽

서버는 `0.0.0.0`에 바인딩하지만 인바운드 규칙이 없으면 같은 PC에서만 접속된다.
`service/firewall.js`가 `AutoPrint`라는 고정 이름의 규칙을 관리한다.

- 조회는 일반 권한으로 된다. 규칙 유무·활성화·**포트 일치**까지 본다.
  규칙이 남아 있어도 포트가 예전 값이면 열린 것이 아니다.
- 적용은 관리자 권한이 필요해 `installer.js`(UAC 승격)에서 실행한다.
  서비스 등록·갱신 때 함께 적용되고, 등록 해제 때 거둔다.
- 앱은 시작할 때 상태를 확인하고, 닫혀 있으면 한 번 권한을 요청해 연다.
  거절하면 그 실행에서는 다시 묻지 않는다.

### 인쇄 결과 확인 (세션 0 제약)

**SumatraPDF는 작업을 스풀러에 넘기기만 하고 바로 종료 코드 0을 준다.** 그래서 종료
코드만 보고 응답하면, 스풀러에서 실패해도 "인쇄 완료"라고 답하게 된다. 실제로 그랬다.

실패하는 대표적인 경우가 **저장 위치를 묻는 가상 프린터**다.

| 프린터 | 포트 | 서비스에서 |
| --- | --- | --- |
| Microsoft Print to PDF | `PORTPROMPT:` | 불가 |
| WPS Print to PDF | `Kingsoft Virtual Printer Port` | 불가 |
| OneNote | 앱 포트 | 불가 |

이 프린터들은 "어디에 저장할까요?" 대화상자가 떠야 인쇄가 끝난다. 서비스는 **세션 0**에서
LocalSystem으로 돌아 데스크톱이 없으므로 그 창을 띄울 수 없고, 작업이
`Error, Retained` 상태로 큐에 멈춘다. 사람이 쓰는 앱에서는 잘 되기 때문에 원인을
찾기 어렵다. 큐가 막히면 이후 작업까지 밀리므로 `Get-PrintJob`으로 확인하고 비워야 한다.

`printer/spooler.js`가 두 가지를 맡는다.

- `needsDesktop(port)` — 포트 이름으로 데스크톱이 필요한 프린터인지 판별한다.
  `/api/printers`가 각 프린터에 `usable`을 붙여 내려주고, `/api/print`는 그런 프린터로
  보내려 하면 **422**와 이유를 돌려준다. 보내봐야 큐에 멈추기 때문이다.
- `watchJob(printer, file)` — 제출한 작업을 몇 초간 지켜본다. 큐에서 사라지면 `done`,
  `Error|Blocked|Offline|PaperOut|UserIntervention`이면 실패, 남아 있으면 `pending`이다.

`watchJob`은 **파일 이름으로** 작업을 찾는다. 스풀러의 `DocumentName`은 역슬래시 전체
경로라, 슬래시 경로를 그대로 비교하면 영영 일치하지 않아 실패한 작업을 놓친다.

확인하려면 프린터를 일시 중지(`Win32_Printer.Pause`)하고 인쇄해 `pending`이 나오는지 본다.

### 문자 인코딩

- `pdf-to-printer`는 PowerShell 출력을 UTF-8로 고정해 읽으므로 프린터 목록은 안전하다.
- **업로드 파일명은 위험하다.** multipart의 파일명은 latin1로 디코딩되어 들어온다.
  임시 파일 이름은 ASCII로만 짓고(확장자만 보존), 원본 이름은 `decodeOriginalName()`이
  UTF-8로 되돌려 응답에만 쓴다. 되돌린 결과에 U+FFFD가 있으면 원본을 그대로 둔다.
  (브라우저가 아닌 클라이언트가 CP949로 보내는 경우가 있어 함부로 바꾸면 더 깨진다.)

### 다국어

`shared/i18n.js` 한 곳에 한국어·중국어(간체) 문구를 둔다.
관리 앱은 직접 require하고, 웹 페이지는 `/api/i18n`으로 받아 간다.

- 정적 문구는 `data-i18n` 속성으로 표시하고 `applyLanguage()`가 채운다.
- 상태에서 만들어지는 문구는 마지막 상태를 기억해 두었다가 언어를 바꿀 때 다시 그린다.
- 선택한 언어는 `localStorage`에 남긴다. 처음에는 시스템 로케일을 따른다.
- 키를 추가할 때는 `ko`/`zh` 양쪽에 넣는다. 한쪽이 빠지면 기본 언어로 떨어진다.

### 포트 소유권

**포트(19190)를 여는 것은 서비스뿐이다.** 앱은 어떤 경우에도 자체 서버를 띄우지 않으며,
서비스를 등록/제어하고 상태를 보여주는 관리 UI 역할만 한다.

예전에는 서비스가 없으면 앱이 대신 서버를 띄우는 폴백이 있었다. 그 결과 서비스를
등록하지 않았는데도 앱만 켜져 있으면 포트가 열려, 지금 인쇄가 되는 이유가 서비스인지
앱인지 구분할 수 없었다. 폴백을 없애 소유권을 서비스로 일원화했다.

포트 상수는 `src/shared/network.js`에만 있고 서버와 서비스 설정이 이를 참조한다.
접속 주소(IP/URL)도 같은 파일의 `getNetworkInfo()`가 계산하며, 앱은 서버를 거치지 않고
main 프로세스에서 직접 받는다. 서비스가 꺼져 있어도 접속 주소는 보여줘야 하기 때문이다.

`manager.getStatus()`는 서비스 상태와 별개로 포트를 실제로 확인한다.

| 조합 | 의미 |
| --- | --- |
| `running` + `reachable` | 정상 |
| `running`, `!reachable` | 서비스는 떠 있으나 응답 없음 |
| `!running`, `portOpen` | 다른 프로그램이 점유 — 서비스 시작이 EADDRINUSE로 실패한다 |
| `!portOpen` | 서버 없음 |

`probe()`는 `/api/info`가 200을 주는지(=AutoPrint인지)까지 보고,
`isPortOpen()`은 TCP 연결만 확인해 전혀 무관한 프로그램의 점유도 잡아낸다.

### 포트와 동적 포트 범위

포트는 **19190**이다. Windows 동적 포트 범위(기본 49152~65535) **밖**이라 다른
프로그램이 임시 포트로 선점할 수 없다. 이 범위를 피하는 것이 요점이다.

한때 59190을 쓰면서 `netsh int ipv4 add excludedportrange`로 예약을 시도했는데,
**이 방법은 쓰면 안 된다.** 그 목록에 든 포트는 동적 할당에서 빠질 뿐 아니라
**명시적 bind까지 거부된다.** 예약을 넣은 순간 데몬이 포트를 잡지 못해 재시작을
반복했다. 범위 안의 포트를 안전하게 선점해 두는 방법은 없고, 범위 밖으로 옮기는
것이 유일한 해결책이다.

`installer.js`는 설치·갱신 때 `clearStalePortReservation()`으로 예전 버전이 남긴 예약을
걷어내고, `warnIfInDynamicPortRange()`로 포트가 범위 안일 때만 로그에 경고를 남긴다.
지금 포트는 범위 밖이라 경고가 나오지 않는다.

포트를 바꾸려면 `src/shared/network.js`의 `PORT` 한 줄만 고친다. 서버·서비스 설명·
방화벽 규칙·앱 UI가 모두 이 값을 따라간다. **바꾼 뒤에는 서비스를 갱신해야** 방화벽
규칙이 새 포트로 옮겨간다.

현재 예약 목록은 `netsh int ipv4 show excludedportrange protocol=tcp` 로 확인한다.

### 서비스 재시작이 먹지 않는 경우

데몬은 `ELECTRON_RUN_AS_NODE`로 뜬 프로세스라 winsw가 보내는 SIGINT를 받지 못한다
(wrapper.log에 `SIGINT to <pid> failed - Killing as fallback`). 이때 자식이 살아남아
포트를 계속 쥐면, 새 데몬이 포트를 잡지 못해 **재시작해도 옛 코드가 응답한다.**
겉으로는 "설정 갱신"이 아무 효과가 없는 것처럼 보인다.

`killStalePortOwner()`가 서비스 정지 후 포트를 쥔 프로세스를 이름(`electron`/`AutoPrint`)으로
확인하고 거둔다. install·refresh·uninstall 모두에서 부른다.

확인하려면 `/api/info` 응답에 임시 표식을 넣고 갱신 후 바뀌는지 본다.

### CORS

관리 앱은 `file://` 페이지라 출처가 `null`이고, 웹 인쇄 페이지와 외부 기기도 서로 다른
출처에서 API를 부른다. CORS 헤더가 없으면 브라우저가 응답을 가로막아 **서버는 정상인데
화면만 비는** 상태가 된다. 실제로 앱의 "기본 프린터" 칸이 비어 있던 원인이 이것이었다.

모든 응답에 `Access-Control-Allow-Origin: *`를 붙이고 프리플라이트는 204로 끝낸다.
