const os = require('os');

// 인쇄 서버가 여는 유일한 포트. 서비스와 앱이 같은 값을 봐야 하므로 여기서만 정의한다.
const PORT = 19190;

/**
 * 외부에서 접근 가능한 IPv4 주소와 접속 URL 목록.
 *
 * 서비스의 /api/info와 앱 UI가 같은 값을 보여줘야 하는데,
 * 앱은 서비스가 꺼져 있을 때도 주소를 표시해야 하므로 계산을 여기로 모은다.
 */
function getNetworkInfo(port) {
  const ips = [];
  const urls = [];

  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    for (const addr of addresses || []) {
      // IPv4만, 내부 주소(127.x.x.x) 제외
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({ interface: interfaceName, ip: addr.address });
        urls.push(`http://${addr.address}:${port}`);
      }
    }
  }

  return { ips, port, urls };
}

module.exports = { PORT, getNetworkInfo };
