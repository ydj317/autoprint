const fs = require('fs');
const path = require('path');

class PrintHandler {
  canHandle(fileType) {
    return false;
  }

  async print(filePath, options) {
    throw new Error('Print method not implemented');
  }
}

module.exports = PrintHandler;
