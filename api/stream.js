const https = require('https');
const { Ytdl } = require('@distube/ytdl-core');

const yt = new Ytdl();
const streamCache = new Map();

function getInnerTubeVrAudio(videoId) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID_VR',
          clientVersion: '1.43.32',
          deviceMake: 'Oculus',
          deviceModel: 'Quest 3',
          hl: 'en',
          gl: 'US'
        }
      },
      videoId: videoId
    });

    const req = https.request('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const af = (j.streamingData?.adaptiveFormats || []).filter(f => f.mimeType && f.mimeType.startsWith('audio'));
          const f = af.find(x => x.itag === 140) || af[0];
          if (f && f.url) {
            resolve({
              url: f.url,
              mimeType: f.mimeType ? f.mimeType.split(';')[0].trim() : 'audio/mp4',
              contentLength: f.contentLength,
              duration: parseInt(j.videoDetails?.lengthSeconds, 10) || 0,
              title: j.videoDetails?.title || '',
              expires: Date.now() + 3600000
            });
            return;
          }
        } catch (e) {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.write(postData);
    req.end();
  });
}

async function getAudioInfo(videoId) {
  const cached = streamCache.get(videoId);
  if (cached && Date.now() < cached.expires) {
    return cached;
  }

  // 1. First try @distube/ytdl-core
  try {
    const info = await yt.getInfo(videoId);
    const format = info.formats.find(f => f.itag === 140) ||
                   info.formats.find(f => f.hasAudio && !f.hasVideo && (f.mimeType || '').includes('mp4')) ||
                   info.formats.find(f => f.hasAudio && !f.hasVideo);

    if (format && format.url) {
      const data = {
        url: format.url,
        mimeType: format.mimeType ? format.mimeType.split(';')[0].trim() : 'audio/mp4',
        contentLength: format.contentLength,
        duration: parseInt(info.videoDetails?.lengthSeconds, 10) || 0,
        title: info.videoDetails?.title || '',
        expires: Date.now() + 3600000
      };
      streamCache.set(videoId, data);
      return data;
    }
  } catch (err) {
    // Continue to fallback
  }

  // 2. Fallback: InnerTube ANDROID_VR client
  const vrData = await getInnerTubeVrAudio(videoId);
  if (vrData) {
    streamCache.set(videoId, vrData);
    return vrData;
  }

  throw new Error('Unable to extract audio stream for ' + videoId);
}

module.exports = async function handleStream(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead ? res.writeHead(204) : (res.status ? res.status(204).end() : res.end());
    return;
  }

  let videoId = null;
  if (req.query && (req.query.id || req.query.v || req.query.videoId)) {
    videoId = req.query.id || req.query.v || req.query.videoId;
  } else {
    try {
      const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      videoId = parsed.searchParams.get('id') || parsed.searchParams.get('v') || parsed.searchParams.get('videoId');
    } catch (e) {}
  }

  if (!videoId) {
    const code = 400;
    const body = JSON.stringify({ error: 'Missing video id parameter' });
    if (res.writeHead) {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(body);
    } else {
      res.status(code).json({ error: 'Missing video id parameter' });
    }
    return;
  }

  try {
    const audioInfo = await getAudioInfo(videoId);
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    };

    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    const upstreamReq = https.request(audioInfo.url, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders
    }, (upstreamRes) => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Accept-Ranges': 'bytes',
        'Content-Type': upstreamRes.headers['content-type'] || audioInfo.mimeType || 'audio/mp4',
        'Cache-Control': 'public, max-age=3600'
      };

      if (upstreamRes.headers['content-range']) {
        headers['Content-Range'] = upstreamRes.headers['content-range'];
      }
      if (upstreamRes.headers['content-length']) {
        headers['Content-Length'] = upstreamRes.headers['content-length'];
      }

      const statusCode = upstreamRes.statusCode || (req.headers.range ? 206 : 200);

      if (res.writeHead) {
        res.writeHead(statusCode, headers);
      } else if (res.status) {
        res.status(statusCode);
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      }

      if (req.method === 'HEAD') {
        res.end();
        upstreamRes.resume();
        return;
      }

      upstreamRes.pipe(res);

      req.on('close', () => {
        try { upstreamReq.destroy(); } catch (e) {}
      });
    });

    upstreamReq.on('error', (err) => {
      if (!res.headersSent) {
        if (res.writeHead) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upstream stream error: ' + err.message }));
        } else {
          res.status(502).json({ error: 'Upstream stream error: ' + err.message });
        }
      }
    });

    upstreamReq.end();
  } catch (err) {
    if (!res.headersSent) {
      if (res.writeHead) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
};

module.exports.getAudioInfo = getAudioInfo;

