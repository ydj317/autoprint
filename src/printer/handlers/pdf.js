const PrintHandler = require('./base');
const pdfToPrinter = require('pdf-to-printer');

class PdfHandler extends PrintHandler {
  canHandle(fileType) {
    return fileType === 'application/pdf' || fileType === '.pdf';
  }

  async print(filePath, options) {
    const printOptions = {
      printer: options.printer,
      paperSize: options.paperSize,
      orientation: options.orientation,
      copies: options.copies,
      color: options.color === 'color',
      sides: options.sides
    };

    Object.keys(printOptions).forEach(key => {
      if (printOptions[key] === undefined || printOptions[key] === null) {
        delete printOptions[key];
      }
    });

    return await pdfToPrinter.print(filePath, printOptions);
  }
}

module.exports = PdfHandler;
