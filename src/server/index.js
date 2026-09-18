const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PORT, getNetworkInfo } = require('../shared/network');
const i18n = require('../shared/i18n');
const spooler = require('../printer/spooler');

/**
 * multipart 헤더의 파일명을 UTF-8로 되돌린다.
 *
 * busboy는 파일명을 latin1로 디코딩하므로, 브라우저가 UTF-8로 보낸 한글·중국어
 * 이름이 바이트 그대로 남는다. 다시 UTF-8로 읽어야 원래 글자가 나온다.
 * 이미 올바른 문자열이거나 복원이 실패하면 원본을 그대로 돌려준다.
 */
function decodeOriginalName(name) {
  if (!name) return '';

  try {
    const restored = Buffer.from(name, 'latin1').toString('utf8');
    // 복원 결과에 U+FFFD가 있으면 원래 latin1이 아니었다는 뜻이다.
    return restored.includes('�') ? name : restored;
  } catch (_) {
    return name;
  }
}

class Server {
  constructor(printerManager) {
    this.printerManager = printerManager;
    this.app = null;
    this.server = null;
    this.port = PORT;
    this.tmpDir = path.join(os.tmpdir(), 'autoprint');
  }

  async start() {
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    return new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server = null;
        if (error.code === 'EADDRINUSE') {
          // 서비스가 이미 같은 포트를 점유한 경우가 대부분이다.
          error.portInUse = true;
        }
        reject(error);
      };

      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        this.server.removeListener('error', onError);
        console.log(`Server running on port ${this.port}`);
        console.log(`Temp directory: ${this.tmpDir}`);
        resolve(this.port);
      });

      this.server.once('error', onError);
    });
  }

  stop() {
    if (!this.server) return;

    // close()는 새 연결만 막는다. keep-alive 연결이 남아 있으면 포트가 바로
    // 풀리지 않아, 뒤이어 포트를 잡으려는 서비스가 EADDRINUSE로 실패한다.
    if (typeof this.server.closeAllConnections === 'function') {
      this.server.closeAllConnections();
    }
    this.server.close();
    this.server = null;
  }

  setupMiddleware() {
    /**
     * 어느 출처에서든 API를 부를 수 있게 한다.
     *
     * 이 서버는 다른 기기와 다른 페이지에서 인쇄를 요청받는 것이 목적이고,
     * 관리 앱도 file:// 페이지라 출처가 null이다. CORS 헤더가 없으면 브라우저가
     * 응답을 가로막아, 서버는 정상인데 화면만 비는 상태가 된다.
     */
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // 프리플라이트는 본문 없이 바로 끝낸다.
      if (req.method === 'OPTIONS') return res.sendStatus(204);

      next();
    });

    this.app.use(express.json());

    const publicPath = this.getPublicPath();
    this.app.use(express.static(publicPath));

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.tmpDir);
      },
      /**
       * 임시 파일 이름에는 원본 이름을 쓰지 않는다.
       *
       * multipart의 파일명은 latin1로 디코딩되어 들어오기 때문에 한글·중국어
       * 파일명이 그대로 디스크에 쓰이면 깨진 경로가 만들어지고, 그 경로를 받는
       * SumatraPDF가 파일을 찾지 못한다. 인쇄에 파일명은 쓰이지 않으므로
       * ASCII로만 짓고, 원본 이름은 따로 복원해 응답에만 쓴다.
       */
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(decodeOriginalName(file.originalname)).toLowerCase();
        const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.pdf';
        cb(null, uniqueSuffix + safeExt);
      }
    });

    this.upload = multer({ storage });
  }

  getPublicPath() {
    // process.resourcesPath는 Electron에만 있다. 데몬을 순수 Node로 돌리면
    // undefined가 들어와 path.join이 그 자리에서 던진다.
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'public'),
      process.resourcesPath ? path.join(process.resourcesPath, 'public') : null,
      path.join(path.dirname(process.execPath), 'resources', 'public')
    ].filter(Boolean);

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return path.join(__dirname, '..', '..', 'public');
  }

  setupRoutes() {
    this.app.get('/api/printers', async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      const details = this.printerManager.getPrinterDetails();

      // 저장 위치를 묻는 가상 프린터는 서비스에서 인쇄가 끝나지 않는다.
      // 목록에서 미리 알려줘야 사용자가 헛되이 고르지 않는다.
      let ports = [];
      try {
        ports = await spooler.getPrinterPorts();
      } catch (_) {
        ports = [];
      }

      const marked = details.map((printer) => {
        const port = (ports.find((p) => p.name === printer.name) || {}).port;
        return { ...printer, port: port || null, usable: !spooler.needsDesktop(port) };
      });

      res.json({
        printers: this.printerManager.getPrinters(),
        defaultPrinter: this.printerManager.defaultPrinter,
        details: marked
      });
    });

    // 웹 페이지가 앱과 같은 문구를 쓰도록 사전을 그대로 내려준다.
    this.app.get('/api/i18n', (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({
        languages: i18n.LANGUAGES,
        defaultLanguage: i18n.DEFAULT_LANGUAGE,
        messages: i18n.MESSAGES
      });
    });

    this.app.get('/api/options', (req, res) => {
      const defaultOptions = this.printerManager.getDefaultOptions();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({ options: defaultOptions });
    });

    this.app.post('/api/print', this.upload.single('file'), async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const originalName = decodeOriginalName(req.file.originalname);

      // 인쇄가 실패해도 업로드된 임시 파일은 반드시 지운다.
      const cleanup = () => fs.unlink(req.file.path, () => {});

      let options = {
        printer: this.printerManager.defaultPrinter,
        ...this.printerManager.getDefaultOptions()
      };

      if (req.body.options) {
        try {
          options = { ...options, ...JSON.parse(req.body.options) };
        } catch (error) {
          // 조용히 기본값으로 인쇄하면 사용자는 옵션이 먹은 줄 안다.
          cleanup();
          return res.status(400).json({ error: `Invalid options JSON: ${error.message}` });
        }
      }

      // 빈 문자열을 그대로 넘기면 "이름 없는 프린터"를 찾다가 실패한다.
      if (!options.printer) {
        options.printer = this.printerManager.defaultPrinter;
      }

      // 보내봐야 큐에 멈출 프린터라면 먼저 알려준다.
      const check = await this.printerManager.checkPrinterUsable(options.printer);
      if (!check.usable) {
        cleanup();
        return res.status(422).json({
          error:
            `"${options.printer}" 는 저장 위치를 묻는 가상 프린터(${check.port})라 ` +
            '서비스에서 인쇄할 수 없습니다. 실제 프린터를 선택해 주세요.',
          printer: options.printer,
          file: originalName
        });
      }

      try {
        const result = await this.printerManager.print(req.file.path, options);
        res.json({ success: true, file: originalName, printer: options.printer, result });
      } catch (error) {
        console.error('Print error:', error);
        res.status(500).json({ error: error.message, file: originalName });
      } finally {
        cleanup();
      }
    });

    this.app.get('/api/info', (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(getNetworkInfo(this.port));
    });
  }
}

module.exports = Server;
