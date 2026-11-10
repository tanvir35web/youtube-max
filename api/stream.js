const https = require('https');
const { Ytdl, Client, chooseFormat } = require('@distube/ytdl-core');

const ytOptions = {
  clients: [Client.Tv, Client.Mweb, Client.WebEmbedded, Client.VisionOS, Client.WebMusic]
};
if (process.env.YT_COOKIE) {
  ytOptions.cookie = process.env.YT_COOKIE;
}
const yt = new Ytdl(ytOptions);

// Cache info for fast seeking and repeat play
const infoCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getCachedInfo(videoId) {
  const cached = infoCache.get(videoId);
  if (cached && Date.now() < cached.expires) {
    return cached.info;
  }
  const info = await yt.getInfo(videoId);
  infoCache.set(videoId, {
    info,
    expires: Date.now() + CACHE_TTL_MS
  });
  return info;
}

/**
 * Fallback 1: YouTube InnerTube ANDROID_VR Client
 * Resolves direct googlevideo playback URLs without cipher
 */
function getInnerTubeVrMedia(videoId, type = 'audio') {
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
      },
      timeout: 8000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const title = j.videoDetails?.title || 'video';
          const author = j.videoDetails?.author || 'YouTube';
          const duration = parseInt(j.videoDetails?.lengthSeconds, 10) || 0;
          const thumbs = j.videoDetails?.thumbnail?.thumbnails || [];
          const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          if (type === 'video') {
            const muxedFormats = (j.streamingData?.formats || []).filter(f => f.url);
            const chosen = muxedFormats.find(f => f.itag === 18) || muxedFormats[0];
            if (chosen && chosen.url) {
              resolve({
                url: chosen.url,
                mimeType: chosen.mimeType ? chosen.mimeType.split(';')[0].trim() : 'video/mp4',
                contentLength: chosen.contentLength ? parseInt(chosen.contentLength, 10) : undefined,
                duration,
                title,
                author,
                thumbnail,
                type: 'video',
                extension: 'mp4'
              });
              return;
            }
          }

          const af = (j.streamingData?.adaptiveFormats || []).filter(f => f.mimeType && f.mimeType.startsWith('audio'));
          const f = af.find(x => x.url && x.itag === 140) || af.find(x => x.url && x.itag === 251) || af.find(x => x.url);
          if (f && f.url) {
            resolve({
              url: f.url,
              mimeType: f.mimeType ? f.mimeType.split(';')[0].trim() : 'audio/mp4',
              contentLength: f.contentLength ? parseInt(f.contentLength, 10) : undefined,
              duration,
              title,
              author,
              thumbnail,
              type: 'audio',
              extension: (f.mimeType && f.mimeType.includes('webm')) ? 'webm' : 'm4a'
            });
            return;
          }
        } catch (e) {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(postData);
    req.end();
  });
}

const INVIDIOUS_INSTANCES = [
  'yt.chocolatemoo53.com',
  'invidious.jing.rocks',
  'invidious.nerdvpn.de',
  'yewtu.be'
];

/**
 * Fallback 2: Public Invidious API
 * Resolves streams for videos requiring special client signatures
 */
function getInvidiousMedia(videoId, type = 'audio') {
  return new Promise((resolve) => {
    let instanceIndex = 0;

    function tryNext() {
      if (instanceIndex >= INVIDIOUS_INSTANCES.length) {
        resolve(null);
        return;
      }
      const host = INVIDIOUS_INSTANCES[instanceIndex++];
      const req = https.get(`https://${host}/api/v1/videos/${encodeURIComponent(videoId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 6000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            const title = j.title || 'video';
            const author = j.author || 'YouTube';
            const duration = j.lengthSeconds || 0;
            const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            if (type === 'video') {
              const formats = (j.formatStreams || []).filter(f => f && f.url);
              let chosen = formats.find(f => f.itag === '18' || f.itag === 18) ||
                           formats.find(f => f.itag === '22' || f.itag === 22) ||
                           formats[0];

              if (!chosen && j.adaptiveFormats) {
                const vf = j.adaptiveFormats.filter(f => f && (f.type || '').startsWith('video') && f.url);
                chosen = vf.find(f => f.itag === '136' || f.qualityLabel === '720p') ||
                         vf.find(f => f.itag === '135' || f.qualityLabel === '480p') ||
                         vf.find(f => f.itag === '134' || f.qualityLabel === '360p') ||
                         vf.find(f => (f.type || '').includes('mp4')) ||
                         vf[0];
              }

              if (chosen && chosen.url) {
                const rawClen = chosen.clen || chosen.contentLength || (typeof chosen.size === 'number' ? chosen.size : undefined);
                const contentLength = rawClen ? parseInt(rawClen, 10) : undefined;
                resolve({
                  url: chosen.url,
                  mimeType: chosen.type ? chosen.type.split(';')[0].trim() : 'video/mp4',
                  contentLength,
                  duration,
                  title,
                  author,
                  thumbnail,
                  type: 'video',
                  extension: (chosen.type && chosen.type.includes('webm')) ? 'webm' : 'mp4'
                });
                return;
              }
            }

            // Audio option
            const af = (j.adaptiveFormats || []).filter(f => f && (f.type || '').startsWith('audio') && f.url);
            const f = af.find(x => x.itag === '140' || x.itag === 140) ||
                      af.find(x => x.itag === '251' || x.itag === 251) ||
                      af[0];

            if (f && f.url) {
              const rawClen = f.clen || f.contentLength || (typeof f.size === 'number' ? f.size : undefined);
              const contentLength = rawClen ? parseInt(rawClen, 10) : undefined;
              resolve({
                url: f.url,
                mimeType: f.type ? f.type.split(';')[0].trim() : 'audio/mp4',
                contentLength,
                duration,
                title,
                author,
                thumbnail,
                type: 'audio',
                extension: (f.type && f.type.includes('webm')) ? 'webm' : 'm4a'
              });
              return;
            }
          } catch (e) {}
          tryNext();
        });
      });

      req.on('error', tryNext);
      req.on('timeout', () => {
        req.destroy();
        tryNext();
      });
    }

    tryNext();
  });
}

/**
 * Resolve media stream via @distube/ytdl-core or fallbacks
 */
async function resolveMedia(videoId, type = 'audio') {
  // 1. First try @distube/ytdl-core
  try {
    const info = await getCachedInfo(videoId);
    const title = info.videoDetails?.title || 'YouTube Media';
    const author = info.videoDetails?.author?.name || info.videoDetails?.author || 'YouTube';
    const duration = parseInt(info.videoDetails?.lengthSeconds, 10) || 0;
    const thumbs = info.videoDetails?.thumbnails || [];
    const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    let format = null;
    let extension = 'm4a';

    if (type === 'video') {
      format = info.formats.find(f => f.hasVideo && f.hasAudio && (f.mimeType || '').includes('mp4')) ||
               info.formats.find(f => f.hasVideo && f.hasAudio) ||
               info.formats.find(f => f.hasVideo && (f.mimeType || '').includes('mp4'));
      extension = 'mp4';
    } else {
      try {
        format = chooseFormat(info.formats, { filter: { hasAudio: true, hasVideo: false }, quality: 'highestaudio' });
      } catch (e) {
        format = info.formats.find(f => f.hasAudio && !f.hasVideo && (f.mimeType || '').includes('mp4')) ||
                 info.formats.find(f => f.hasAudio && !f.hasVideo) ||
                 info.formats.find(f => f.hasAudio);
      }
      extension = 'm4a';
    }

    if (format) {
      const media = yt.open(info, format);
      const mimeType = format.mimeType ? format.mimeType.split(';')[0].trim() : (type === 'video' ? 'video/mp4' : 'audio/mp4');
      const contentLength = format.contentLength ? parseInt(format.contentLength, 10) : undefined;
      return {
        media,
        format,
        mimeType,
        contentLength,
        duration,
        title,
        author,
        thumbnail,
        extension,
        type
      };
    }
  } catch (err) {
    console.warn(`ytdl-core resolve warning for ${videoId}:`, err.message);
  }

  // 2. Fallback: InnerTube ANDROID_VR client (bypasses bot checks without cipher)
  try {
    const vrData = await getInnerTubeVrMedia(videoId, type);
    if (vrData) {
      return vrData;
    }
  } catch (vrErr) {
    console.warn('InnerTube VR fallback warning:', vrErr.message);
  }

  // 3. Fallback: Invidious Public API
  try {
    const invData = await getInvidiousMedia(videoId, type);
    if (invData) {
      return invData;
    }
  } catch (invErr) {
    console.warn('Invidious fallback warning:', invErr.message);
  }

  throw new Error(`Unable to resolve media stream for ${videoId}. The video may be restricted or blocked.`);
}

async function getMediaInfo(videoId, type = 'audio') {
  const resolved = await resolveMedia(videoId, type);
  return {
    url: `/api/stream?id=${encodeURIComponent(videoId)}&type=${type}`,
    mimeType: resolved.mimeType,
    contentLength: resolved.contentLength,
    duration: resolved.duration,
    title: resolved.title,
    author: resolved.author,
    thumbnail: resolved.thumbnail,
    type: resolved.type,
    extension: resolved.extension
  };
}

async function getAudioInfo(videoId) {
  return getMediaInfo(videoId, 'audio');
}

/**
 * Handle streaming media (/api/stream)
 * Supports full Range 206 streaming with zero 403 errors
 */
async function handleStream(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Accel-Buffering', 'no');

  if (req.method === 'OPTIONS') {
    res.writeHead ? res.writeHead(204) : (res.status ? res.status(204).end() : res.end());
    return;
  }

  let videoId = null;
  let type = 'audio';

  if (req.query && (req.query.id || req.query.v || req.query.videoId)) {
    videoId = req.query.id || req.query.v || req.query.videoId;
    if (req.query.type) type = req.query.type;
  } else {
    try {
      const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      videoId = parsed.searchParams.get('id') || parsed.searchParams.get('v') || parsed.searchParams.get('videoId');
      if (parsed.searchParams.get('type')) type = parsed.searchParams.get('type');
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
    const resolved = await resolveMedia(videoId, type);

    // If resolved through direct URL (e.g. InnerTube or Invidious)
    if (resolved.url && !resolved.media) {
      return await pipeDirectUrl(resolved.url, req, res, resolved.mimeType);
    }

    const { media, mimeType, contentLength } = resolved;
    const rangeHeader = req.headers.range;

    let statusCode = 200;
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      'Accept-Ranges': 'bytes',
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
      'X-Accel-Buffering': 'no'
    };

    let rangeOpt = {};

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : undefined;
      const total = contentLength || undefined;
      const actualEnd = end !== undefined ? end : (total ? total - 1 : undefined);

      rangeOpt = { start, end: actualEnd };
      statusCode = 206;

      headers['Content-Range'] = `bytes ${start}-${actualEnd !== undefined ? actualEnd : ''}/${total !== undefined ? total : '*'}`;
      if (actualEnd !== undefined) {
        headers['Content-Length'] = String(actualEnd - start + 1);
      }
    } else if (contentLength) {
      headers['Content-Length'] = String(contentLength);
    }

    if (res.writeHead) {
      res.writeHead(statusCode, headers);
    } else if (res.status) {
      res.status(statusCode);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    }

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    return new Promise((resolve, reject) => {
      const readStream = media.read({ range: rangeOpt });
      readStream.pipe(res);

      res.on('finish', resolve);
      res.on('close', resolve);

      req.on('close', () => {
        try { readStream.destroy(); } catch (e) {}
        resolve();
      });

      readStream.on('error', (err) => {
        console.warn('Stream pipe error:', err.message);
        if (!res.headersSent) {
          if (res.writeHead) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          } else {
            res.status(502).json({ error: err.message });
          }
        }
        reject(err);
      });
    });

  } catch (err) {
    console.error('handleStream error:', err);
    if (!res.headersSent) {
      if (res.writeHead) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
}

/**
 * Handle direct file download (/api/download)
 * Sets Content-Disposition: attachment for local storage / file saving
 * Serverless-compatible: returns a Promise so Vercel keeps the function alive until streaming completes
 */
async function handleDownload(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Accel-Buffering', 'no');

  if (req.method === 'OPTIONS') {
    res.writeHead ? res.writeHead(204) : (res.status ? res.status(204).end() : res.end());
    return;
  }

  let videoId = null;
  let type = 'audio';

  if (req.query && (req.query.id || req.query.v || req.query.videoId)) {
    videoId = req.query.id || req.query.v || req.query.videoId;
    if (req.query.type) type = req.query.type;
  } else {
    try {
      const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      videoId = parsed.searchParams.get('id') || parsed.searchParams.get('v') || parsed.searchParams.get('videoId');
      if (parsed.searchParams.get('type')) type = parsed.searchParams.get('type');
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
    const resolved = await resolveMedia(videoId, type);
    const cleanName = (resolved.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim().substring(0, 80);
    const filename = `${cleanName}.${resolved.extension}`;

    // If resolved through direct URL (e.g. InnerTube or Invidious)
    if (resolved.url && !resolved.media) {
      return await pipeDirectUrl(resolved.url, req, res, resolved.mimeType, filename);
    }

    const { media, mimeType, contentLength } = resolved;
    const rangeHeader = req.headers.range;

    let statusCode = 200;
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition',
      'Accept-Ranges': 'bytes',
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    };

    let rangeOpt = {};

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : undefined;
      const total = contentLength || undefined;
      const actualEnd = end !== undefined ? end : (total ? total - 1 : undefined);

      rangeOpt = { start, end: actualEnd };
      statusCode = 206;

      headers['Content-Range'] = `bytes ${start}-${actualEnd !== undefined ? actualEnd : ''}/${total !== undefined ? total : '*'}`;
      if (actualEnd !== undefined) {
        headers['Content-Length'] = String(actualEnd - start + 1);
      }
    } else if (contentLength) {
      headers['Content-Length'] = String(contentLength);
    }

    if (res.writeHead) {
      res.writeHead(statusCode, headers);
    } else if (res.status) {
      res.status(statusCode);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    }

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    return new Promise((resolve, reject) => {
      const readStream = media.read({ range: rangeOpt });
      readStream.pipe(res);

      res.on('finish', resolve);
      res.on('close', resolve);

      req.on('close', () => {
        try { readStream.destroy(); } catch (e) {}
        resolve();
      });

      readStream.on('error', (err) => {
        console.warn('Download pipe error:', err.message);
        if (!res.headersSent) {
          if (res.writeHead) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          } else {
            res.status(502).json({ error: err.message });
          }
        }
        reject(err);
      });
    });

  } catch (err) {
    console.error('handleDownload error:', err);
    if (!res.headersSent) {
      if (res.writeHead) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
}

/**
 * Pipe direct external URL to response
 * Automatically follows 301, 302, 303, 307, 308 redirects on the server so client gets full CORS & stream
 * Returns a Promise that resolves when response finishes streaming
 */
function pipeDirectUrl(initialUrl, req, res, mimeType, filename = null, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function fetchUrl(targetUrl, redirectsLeft) {
      if (redirectsLeft <= 0) {
        const err = new Error('Too many redirects');
        if (!res.headersSent) {
          if (res.writeHead) res.writeHead(502, { 'Content-Type': 'application/json' });
          else if (res.status) res.status(502).json({ error: err.message });
          res.end ? res.end(JSON.stringify({ error: err.message })) : null;
        }
        return reject(err);
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl);
      } catch (err) {
        if (!res.headersSent) {
          if (res.writeHead) res.writeHead(502, { 'Content-Type': 'application/json' });
          else if (res.status) res.status(502).json({ error: 'Invalid media URL' });
          res.end ? res.end(JSON.stringify({ error: 'Invalid media URL' })) : null;
        }
        return reject(err);
      }

      const client = parsedUrl.protocol === 'http:' ? require('http') : https;
      const upstreamHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      if (req.headers && req.headers.range) {
        upstreamHeaders['Range'] = req.headers.range;
      }

      const upstreamReq = client.request(targetUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders
      }, (upstreamRes) => {
        // Automatically follow 301, 302, 303, 307, 308 redirects
        if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
          upstreamRes.resume(); // discard body
          const nextUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
          return fetchUrl(nextUrl, redirectsLeft - 1);
        }

        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition',
          'Accept-Ranges': 'bytes',
          'Content-Type': upstreamRes.headers['content-type'] || mimeType || (filename && filename.endsWith('.mp4') ? 'video/mp4' : 'audio/mp4'),
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no'
        };

        if (filename) {
          headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
        }
        if (upstreamRes.headers['content-range']) {
          headers['Content-Range'] = upstreamRes.headers['content-range'];
        }
        if (upstreamRes.headers['content-length']) {
          headers['Content-Length'] = upstreamRes.headers['content-length'];
        }

        const statusCode = upstreamRes.statusCode || (req.headers && req.headers.range ? 206 : 200);

        if (res.writeHead) {
          res.writeHead(statusCode, headers);
        } else if (res.status) {
          res.status(statusCode);
          for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        }

        if (req.method === 'HEAD') {
          res.end();
          upstreamRes.resume();
          resolve();
          return;
        }

        upstreamRes.pipe(res);

        res.on('finish', resolve);
        res.on('close', resolve);

        if (req.on) {
          req.on('close', () => {
            try { upstreamReq.destroy(); } catch (e) {}
            resolve();
          });
        }

        upstreamRes.on('error', (err) => {
          console.warn('pipeDirectUrl upstreamRes error:', err.message);
          reject(err);
        });
      });

      upstreamReq.on('error', (err) => {
        console.warn('pipeDirectUrl upstreamReq error:', err.message);
        if (!res.headersSent) {
          if (res.writeHead) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          } else if (res.status) {
            res.status(502).json({ error: err.message });
          }
        }
        reject(err);
      });

      upstreamReq.end();
    }

    fetchUrl(initialUrl, maxRedirects);
  });
}

module.exports = async (req, res) => {
  return handleStream(req, res);
};
module.exports.handleStream = handleStream;
module.exports.handleDownload = handleDownload;
module.exports.getMediaInfo = getMediaInfo;
module.exports.getAudioInfo = getAudioInfo;
