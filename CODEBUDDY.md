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

### 2. Web Interface
- 파일 업로드 및 즉시 인쇄 기능
- 프린터 설정 UI 제공

### 3. Print Options
지원 가능한 옵션 (기본값 포함):
- 프린터 선택 (기본 프린터 자동 선택)
- 용지 크기 (A4 기본)
- 용지 방향 (세로 기본)
- 복사 매수 (1부 기본)
- 컬러/흑백 (컬러 기본)
- 양면 인쇄 (단면 기본)

### 4. Network Info Display
- 현재 컴퓨터 IP 표시
- 외부 사용자가 IP로 API 접근 가능

## Architecture

```
AutoPrint/
├── main.js                 # Electron main process
├── src/
│   ├── server/             # Web server & API
│   │   ├── index.js        # Server entry
│   │   ├── routes/         # API routes
│   │   └── handlers/       # Request handlers
│   ├── printer/            # Printing logic
│   │   ├── index.js        # Printer manager
│   │   └── handlers/       # File type handlers (PDF, etc.)
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

### API Endpoints (예정)
- `POST /api/print` - 파일 업로드 및 인쇄
- `GET /api/printers` - 사용 가능한 프린터 목록
- `GET /api/options` - 프린트 옵션 기본값

## Development Notes

- 모든 코드는 CommonJS (`require`/`module.exports`) 사용
- Electron main process에서 웹서버 실행
- 프린터 접근은 Windows 용 라이브러리 사용
