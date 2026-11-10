/**
 * YouTube Max - Server with Direct YouTube InnerTube API Integration
 * Zero external dependencies - 100% reliable, no dead Invidious instances
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const handleStream = require('./api/stream');
const { getAudioInfo, handleDownload, getMediaInfo } = require('./api/stream');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// YouTube InnerTube Search Helper
function searchInnerTube(query) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20231201.00.00',
          hl: 'en',
          gl: 'US'
        }
      },
      query: query
    });

    const req = https.request('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const sections = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
          const videos = [];
          if (sections) {
            for (const section of sections) {
              const items = section.itemSectionRenderer?.contents;
              if (items) {
                for (const item of items) {
                  const v = item.videoRenderer;
                  if (v && v.videoId) {
                    const thumbs = v.thumbnail?.thumbnails || [];
                    const bestThumb = thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
                    const chThumbs = v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails || [];
                    const chThumb = chThumbs.length ? chThumbs[0].url : '';
                    
                    videos.push({
                      videoId: v.videoId,
                      title: v.title?.runs?.[0]?.text || 'Untitled',
                      author: v.ownerText?.runs?.[0]?.text || '',
                      views: v.viewCountText?.simpleText || (v.viewCountText?.runs?.[0]?.text ? v.viewCountText.runs[0].text + ' views' : ''),
                      published: v.publishedTimeText?.simpleText || 'Recently',
                      duration: v.lengthText?.simpleText || '',
                      thumbnail: bestThumb,
                      authorThumb: chThumb
                    });
                  }
                }
              }
            }
          }
          resolve(videos);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // API Feed Endpoint (Direct YouTube InnerTube)
  if (pathname === '/api/feed') {
    const topic = parsedUrl.searchParams.get('topic') || 'trending';
    const topicQueries = {
      trending: 'trending videos today',
      music: 'trending music songs 2026',
      gaming: 'popular gaming gameplay',
      news: 'world news today live',
      podcasts: 'trending podcast full episode',
      bangla: 'bangla song natok drama trending',
      lofi: 'lofi hip hop chill beats relax',
      tech: 'tech reviews latest gadgets'
    };
    const query = topicQueries[topic] || topic;

    try {
      const videos = await searchInnerTube(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(videos));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API Search Endpoint
  if (pathname === '/api/search') {
    const query = parsedUrl.searchParams.get('q') || 'trending';
    try {
      const videos = await searchInnerTube(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(videos));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API Direct Native Audio Stream Endpoint (100% Screen-Off & Background Play)
  if (pathname === '/api/stream') {
    return handleStream(req, res);
  }

  // API Direct File Download Endpoint (Local Offline Download for Video & Audio)
  if (pathname === '/api/download') {
    return handleDownload(req, res);
  }

  // API Audio Metadata Info Endpoint
  if (pathname === '/api/audio-info') {
    const videoId = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('v');
    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing video id' }));
      return;
    }
    try {
      const info = await getAudioInfo(videoId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: videoId,
        title: info.title,
        duration: info.duration,
        mimeType: info.mimeType,
        contentLength: info.contentLength
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Error reading file');
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        res.end(content);
      }
    });
  });
});

const localIp = getLocalIp();

function startServer(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log('====================================================');
    console.log('  🚀 YouTube Max - iPhone PWA Server Running');
    console.log('  🔥 YouTube InnerTube Engine: Active (100% Reliable)');
    console.log('====================================================');
    console.log(`  📱 iPhone URL (Same Wi-Fi): http://${localIp}:${port}`);
    console.log(`  💻 PC Local URL:           http://localhost:${port}`);
    console.log('====================================================');
    console.log('  Instructions:');
    console.log(`  1. Open Safari on iPhone -> http://${localIp}:${port}`);
    console.log('  2. Tap Share button -> "Add to Home Screen"');
    console.log('  3. Enjoy Ad-Free YouTube with Background Play!');
    console.log('====================================================');
  });
}

startServer(PORT);
