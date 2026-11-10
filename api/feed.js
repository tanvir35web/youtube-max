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
    res.status(204).end();
    return;
  }

  const topic = req.query.topic || 'trending';
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
    res.status(200).json(list1);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
