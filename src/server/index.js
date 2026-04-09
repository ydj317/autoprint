const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

class Server {
  constructor(printerManager) {
    this.printerManager = printerManager;
    this.app = null;
    this.server = null;
    this.port = 3821;
    this.tmpDir = path.join(os.tmpdir(), 'autoprint');
  }

  async start() {
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`Server running on port ${this.port}`);
        console.log(`Temp directory: ${this.tmpDir}`);
        resolve(this.port);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }

  setupMiddleware() {
    this.app.use(express.json());

    const publicPath = this.getPublicPath();
    this.app.use(express.static(publicPath));

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.tmpDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    });

    this.upload = multer({ storage });
  }

  getPublicPath() {
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'public'),
      path.join(process.resourcesPath, 'public'),
      path.join(path.dirname(process.execPath), 'resources', 'public')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return path.join(__dirname, '..', '..', 'public');
  }

  setupRoutes() {
    this.app.get('/api/printers', (req, res) => {
      const printers = this.printerManager.getPrinters();
      const defaultPrinter = this.printerManager.defaultPrinter;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({ printers, defaultPrinter });
    });

    this.app.get('/api/options', (req, res) => {
      const defaultOptions = this.printerManager.getDefaultOptions();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({ options: defaultOptions });
    });

    this.app.post('/api/print', this.upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        // 기본 옵션 가져오기
        const defaultOptions = this.printerManager.getDefaultOptions();
        
        // 요청에서 옵션 파싱 (JSON 문자열 또는 개별 필드)
        let options = {
          printer: this.printerManager.defaultPrinter,
          ...defaultOptions
        };

        // options 필드가 있으면 JSON으로 파싱
        if (req.body.options) {
          try {
            const customOptions = JSON.parse(req.body.options);
            options = { ...options, ...customOptions };
          } catch (e) {
            console.error('Failed to parse options JSON:', e);
          }
        }

        const result = await this.printerManager.print(req.file.path, options);

        fs.unlink(req.file.path, () => {});

        res.json({ success: true, result });
      } catch (error) {
        console.error('Print error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/info', (req, res) => {
      const networkInterfaces = os.networkInterfaces();
      const ips = [];
      const urls = [];

      // 모든 네트워크 인터페이스에서 IPv4 주소 추출
      for (const [interfaceName, addresses] of Object.entries(networkInterfaces)) {
        for (const addr of addresses) {
          // IPv4만, 내부 주소(127.x.x.x) 제외
          if (addr.family === 'IPv4' && !addr.internal) {
            ips.push({
              interface: interfaceName,
              ip: addr.address
            });
            urls.push(`http://${addr.address}:${this.port}`);
          }
        }
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({
        ips,
        port: this.port,
        urls
      });
    });
  }
}

module.exports = Server;
