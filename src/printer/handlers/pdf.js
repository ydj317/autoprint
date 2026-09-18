const PrintHandler = require('./base');
const pdfToPrinter = require('pdf-to-printer');

/**
 * API가 받는 옵션 이름을 pdf-to-printer의 이름으로 옮긴다.
 *
 * 라이브러리는 모르는 키를 조용히 버리기 때문에, 이름이 한 글자만 달라도
 * (sides/side) 오류 없이 설정이 사라진다. 매핑을 여기 한곳에 모아둔다.
 */

// 라이브러리가 받는 값: simplex | duplex | duplexlong | duplexshort
const SIDE_MAP = {
  'one-sided': 'simplex',
  'two-sided-long': 'duplexlong',
  'two-sided-short': 'duplexshort',
  // 라이브러리 표기를 그대로 보내는 호출도 받아준다
  simplex: 'simplex',
  duplex: 'duplex',
  duplexlong: 'duplexlong',
  duplexshort: 'duplexshort'
};

// 라이브러리는 monochrome(boolean)만 안다
const MONOCHROME_VALUES = ['monochrome', 'mono', 'grayscale', 'gray', 'bw', 'black'];

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
      pages: options.pages,
      scale: options.scale,
      bin: options.bin
    };

    if (options.color !== undefined && options.color !== null) {
      printOptions.monochrome = MONOCHROME_VALUES.includes(String(options.color).toLowerCase());
    }

    if (options.sides !== undefined && options.sides !== null) {
      const side = SIDE_MAP[String(options.sides).toLowerCase()];
      if (!side) {
        throw new Error(
          `Invalid sides: ${options.sides}. Valid values: ${Object.keys(SIDE_MAP).join(', ')}`
        );
      }
      printOptions.side = side;
    }

    Object.keys(printOptions).forEach(key => {
      if (printOptions[key] === undefined || printOptions[key] === null) {
        delete printOptions[key];
      }
    });

    return await pdfToPrinter.print(filePath, printOptions);
  }
}

module.exports = PdfHandler;
