const https = require('https');

function searchYouTube(query) {
  return new Promise((resolve) => {
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 8000
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
                      author: v.ownerText?.runs?.[0]?.text || 'YouTube Channel',
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
          resolve([]);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });

    req.on('error', () => resolve([]));
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead ? res.writeHead(204) : (res.status ? res.status(204).end() : res.end());
    return;
  }

  let topic = 'trending';
  if (req.query && req.query.topic) {
    topic = req.query.topic;
  } else {
    try {
      const parsed = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
      if (parsed.searchParams.get('topic')) topic = parsed.searchParams.get('topic');
    } catch (e) {}
  }

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
    const list1 = await searchYouTube(query);
    if (res.status) {
      res.status(200).json(list1);
    } else if (res.writeHead) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list1));
    } else {
      res.end(JSON.stringify(list1));
    }
  } catch (err) {
    if (res.status) {
      res.status(500).json({ error: err.message });
    } else if (res.writeHead) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } else {
      res.end(JSON.stringify({ error: err.message }));
    }
  }
};
