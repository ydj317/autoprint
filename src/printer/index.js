const path = require('path');
const pdfToPrinter = require('pdf-to-printer');
const PdfHandler = require('./handlers/pdf');

class PrinterManager {
  constructor() {
    this.printers = [];
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
   */
  setPrinters(printerList) {
    this.printers = printerList.map(p => {
      return p.name || p;
    });
    if (this.printers.length > 0) {
      this.defaultPrinter = this.printers[0];
    }
    console.log('Loaded printers:', this.printers);
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

  async print(filePath, options) {
    const ext = path.extname(filePath).toLowerCase();
    const handler = this.getHandler(ext) || this.getHandler('application/pdf');

    if (!handler) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    return await handler.print(filePath, options);
  }
}

module.exports = PrinterManager;
