const path = require('path');
const pdfToPrinter = require('pdf-to-printer');
const PdfHandler = require('./handlers/pdf');
const spooler = require('./spooler');

class PrinterManager {
  constructor() {
    this.printers = [];
    this.printerDetails = [];
    this.defaultPrinter = null;
    this.handlers = [];
    this.defaultOptions = {
      paperSize: 'A4',
      orientation: 'portrait',
      copies: 1,
      color: 'color',
      sides: 'one-sided'
    };
  }

  async init() {
    this.registerHandlers();
  }

  /**
   * Set printers from Electron's API (called from main process)
   *
   * 이름 목록과 함께 용지 정보도 보관한다. 웹 페이지가 프린터마다 어떤 용지를
   * 쓸 수 있는지 보여줘야 paperSize 옵션을 제대로 채울 수 있기 때문이다.
   */
  setPrinters(printerList) {
    this.printerDetails = printerList.map(p => ({
      name: p.name || p,
      paperSizes: Array.isArray(p.paperSizes) ? p.paperSizes : []
    }));
    this.printers = this.printerDetails.map(p => p.name);

    if (this.printers.length > 0) {
      this.defaultPrinter = this.printers[0];
    }
    console.log('Loaded printers:', this.printers);
  }

  getPrinterDetails() {
    return this.printerDetails || [];
  }

  /**
   * Electron BrowserWindow 없이 프린터 목록을 읽는다.
   * 서비스(헤드리스) 모드에서 사용한다.
   *
   * @param {string} [preferred] 우선 사용할 기본 프린터 이름.
   *   서비스는 LocalSystem으로 실행되어 사용자의 기본 프린터를 알 수 없으므로,
   *   등록 시점에 기록해 둔 값을 여기로 넘긴다.
   */
  async loadFromSystem(preferred) {
    const printers = await pdfToPrinter.getPrinters();
    this.setPrinters(printers);

    if (preferred && this.printers.includes(preferred)) {
      this.defaultPrinter = preferred;
      console.log('Default printer (from settings):', preferred);
      return this.printers;
    }

    try {
      const def = await pdfToPrinter.getDefaultPrinter();
      if (def && def.name && this.printers.includes(def.name)) {
        this.defaultPrinter = def.name;
      }
    } catch (error) {
      // 기본 프린터가 지정되지 않은 환경에서는 목록 첫 번째를 그대로 쓴다.
      console.warn('Failed to resolve default printer:', error.message);
    }

    return this.printers;
  }

  registerHandlers() {
    this.handlers.push(new PdfHandler());
  }

  registerHandler(handler) {
    this.handlers.push(handler);
  }

  getPrinters() {
    return this.printers;
  }

  getDefaultOptions() {
    return { ...this.defaultOptions };
  }

  getHandler(fileType) {
    for (const handler of this.handlers) {
      if (handler.canHandle(fileType)) {
        return handler;
      }
    }
    return null;
  }

  /**
   * 서비스에서 쓸 수 없는 프린터인지 확인한다.
   *
   * 저장 위치를 묻는 가상 프린터는 대화상자가 떠야 인쇄가 끝나는데, 서비스는
   * 세션 0에서 돌아 데스크톱이 없다. 보내봐야 큐에 멈추므로 미리 막고 이유를 알린다.
   */
  async checkPrinterUsable(printerName) {
    if (!printerName) return { usable: true };

    try {
      const ports = await spooler.getPrinterPorts();
      const found = ports.find((p) => p.name === printerName);
      if (!found) return { usable: true };

      if (spooler.needsDesktop(found.port)) {
        return { usable: false, port: found.port };
      }
    } catch (_) {
      // 확인에 실패해도 인쇄 자체를 막지는 않는다.
    }

    return { usable: true };
  }

  async print(filePath, options) {
    const ext = path.extname(filePath).toLowerCase();
    const handler = this.getHandler(ext) || this.getHandler('application/pdf');

    if (!handler) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    const result = await handler.print(filePath, options);

    // SumatraPDF는 스풀러에 넘기기만 하고 바로 끝난다. 여기서 확인하지 않으면
    // 스풀러에서 실패해도 "인쇄 완료"라고 답하게 된다.
    const job = await spooler.watchJob(options.printer, filePath);

    if (!job.ok) {
      const error = new Error(
        `프린터가 작업을 처리하지 못했습니다 (${job.detail}). ` +
        '저장 위치를 묻는 가상 프린터라면 서비스에서는 인쇄할 수 없습니다.'
      );
      error.spoolerStatus = job.detail;
      throw error;
    }

    return { ...result, spooler: job.state };
  }
}

module.exports = PrinterManager;
