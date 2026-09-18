# AutoPrint

원격에서 PDF를 보내면 연결된 프린터로 바로 출력하는 Windows 인쇄 서버입니다.
Windows 서비스로 등록되어 앱을 닫아도, 컴퓨터를 다시 시작해도 계속 동작합니다.

한국어와 중국어(간체)를 지원합니다.

## 내려받기

[Releases](https://github.com/ydj317/autoprint/releases)에서 `AutoPrint-Setup-*.exe`를 받습니다.

> 코드 서명 인증서를 쓰지 않아 설치할 때 Windows SmartScreen 경고가 뜹니다.
> **추가 정보 → 실행**을 누르면 설치됩니다. 파일이 이 저장소에서 빌드된 것인지는
> 아래 "빌드 출처 확인"으로 검증할 수 있습니다.

## 설치와 시작

1. 설치 파일을 실행합니다. `C:\Program Files\AutoPrint`에 설치됩니다.
2. AutoPrint를 실행하고 **서비스 등록하기**를 누릅니다. 관리자 권한 확인 창이 한 번 뜹니다.
3. 등록이 끝나면 인쇄 서버가 바로 동작합니다.

등록할 때 방화벽 규칙도 함께 열리므로 다른 기기에서 접속할 수 있습니다.

## 사용

브라우저에서 아래 주소로 들어가면 PDF를 올려 바로 인쇄할 수 있고,
프린터 목록과 인쇄 옵션, API 사용법을 볼 수 있습니다.

```
http://<이 PC의 IP>:19190
```

### API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/api/print` | PDF 업로드 후 인쇄 (`multipart/form-data`) |
| `GET` | `/api/printers` | 프린터 목록, 기본 프린터, 프린터별 지원 용지 |
| `GET` | `/api/options` | 기본 인쇄 옵션 |
| `GET` | `/api/info` | 서버 IP와 접속 URL |

```bash
curl -X POST http://192.168.0.10:19190/api/print \
  -F "file=@document.pdf" \
  -F 'options={"printer":"HP LaserJet","copies":2,"sides":"two-sided-long"}'
```

### 인쇄 옵션

| 옵션 | 값 | 기본값 |
| --- | --- | --- |
| `printer` | 프린터 이름 | 시스템 기본 프린터 |
| `copies` | 1 이상 | 1 |
| `paperSize` | `A4`, `Letter` 등 | A4 |
| `orientation` | `portrait`, `landscape` | portrait |
| `color` | `color`, `monochrome` | color |
| `sides` | `one-sided`, `two-sided-long`, `two-sided-short` | one-sided |
| `pages` | `1-3`, `2`, `1-3,7` | 전체 |
| `scale` | `noscale`, `shrink`, `fit` | 라이브러리 기본 |

옵션을 비워두면 시스템 기본 프린터로 기본 옵션 인쇄합니다.

## 알아두면 좋은 것

**가상 프린터는 쓸 수 없습니다.** `Microsoft Print to PDF`처럼 저장 위치를 묻는
프린터는 대화상자가 떠야 인쇄가 끝나는데, 서비스는 데스크톱이 없는 세션에서 돌기 때문에
그 창을 띄울 수 없습니다. 이런 프린터는 목록에 **사용 불가**로 표시되고, 인쇄를 요청하면
이유를 담아 거절합니다. 실제 프린터를 사용하세요.

**사용자 계정에만 추가된 네트워크 프린터는 보이지 않습니다.** 서비스는 시스템 계정으로
실행됩니다. 앱이 이런 프린터를 발견하면 경고로 알려줍니다. 해당 프린터를 이 컴퓨터에
직접 설치하면 서비스에서도 인식됩니다.

**기본 프린터는 자동으로 따라갑니다.** 시스템 기본 프린터를 바꾸면 1분 안에 반영됩니다.

**포트는 19190입니다.** 바꾸려면 `src/shared/network.js`의 `PORT` 한 줄만 고치고 다시
빌드한 뒤, 앱에서 **설정 갱신**을 누르면 방화벽 규칙도 새 포트로 옮겨갑니다.

## 빌드 출처 확인

릴리스 파일이 이 저장소에서 GitHub Actions로 빌드된 것인지 확인할 수 있습니다.

```bash
gh attestation verify AutoPrint-Setup-1.1.0.exe --repo ydj317/autoprint
```

## 직접 빌드하기

```bash
npm ci
npm run build      # dist/AutoPrint-Setup-<version>.exe
npm run dev        # 개발 실행
```

Windows 전용입니다. 인쇄는 `pdf-to-printer`(SumatraPDF), 서비스 등록은 `node-windows`(winsw)를
사용합니다.

## 라이선스

MIT
