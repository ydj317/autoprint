const { ipcRenderer } = require('electron');

const SERVER_URL = 'http://localhost:3821';

let serverInfo = {};

async function init() {
  ipcRenderer.on('server-started', async (event, data) => {
    console.log('Server started event received:', data);
    await loadNetworkInfo();
  });
}

async function loadNetworkInfo() {
  try {
    const response = await fetch(`${SERVER_URL}/api/info`);
    const data = await response.json();

    serverInfo = data;

    // IP 목록 표시
    const ipList = document.getElementById('ip-list');
    ipList.innerHTML = '';

    if (data.ips && data.ips.length > 0) {
      data.ips.forEach(ipInfo => {
        const item = document.createElement('div');
        item.className = 'ip-item';

        const info = document.createElement('div');
        info.className = 'ip-info';

        const interfaceSpan = document.createElement('span');
        interfaceSpan.className = 'ip-interface';
        interfaceSpan.textContent = ipInfo.interface;

        const addressSpan = document.createElement('span');
        addressSpan.className = 'ip-address';
        addressSpan.textContent = ipInfo.ip;

        info.appendChild(interfaceSpan);
        info.appendChild(addressSpan);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = '복사';
        copyBtn.addEventListener('click', () => copyText(ipInfo.ip));

        item.appendChild(info);
        item.appendChild(copyBtn);
        ipList.appendChild(item);
      });
    } else {
      ipList.textContent = 'IP 주소를 찾을 수 없습니다';
    }

    // URL 목록 표시
    const urlList = document.getElementById('url-list');
    urlList.innerHTML = '';

    if (data.urls && data.urls.length > 0) {
      data.urls.forEach(url => {
        const row = document.createElement('div');
        row.className = 'url-row';

        const urlValue = document.createElement('span');
        urlValue.className = 'url-value';
        urlValue.textContent = url;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = '복사';
        copyBtn.addEventListener('click', () => copyText(url));

        row.appendChild(urlValue);
        row.appendChild(copyBtn);
        urlList.appendChild(row);
      });
    } else {
      urlList.textContent = 'URL을 생성할 수 없습니다';
    }
  } catch (error) {
    console.error('Failed to load network info:', error);
    document.getElementById('ip-list').textContent = '정보 로드 실패';
    document.getElementById('url-list').textContent = '정보 로드 실패';
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

document.addEventListener('DOMContentLoaded', init);
