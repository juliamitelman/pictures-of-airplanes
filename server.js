require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;

// In-memory cache: { query: { data, timestamp } }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting: simple per-IP throttle
const rateLimit = new Map();
const RATE_WINDOW = 1000; // 1 second
const RATE_MAX = 3; // max requests per window

app.use(express.static(path.join(__dirname, 'public')));

// Image proxy — avoids Pixabay hotlinking blocks
// Stores a mapping of proxy ID -> real Pixabay URL
const imageMap = new Map();

app.get('/api/image/:id', async (req, res) => {
  const realUrl = imageMap.get(req.params.id);
  if (!realUrl) {
    return res.status(404).send('Not found');
  }

  try {
    const response = await fetch(realUrl);
    if (!response.ok) throw new Error('Image fetch failed');
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).send('Image unavailable');
  }
});

app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json([]);
  }

  if (!PIXABAY_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Rate limiting
  const ip = req.ip;
  const now = Date.now();
  const ipEntry = rateLimit.get(ip) || { count: 0, start: now };
  if (now - ipEntry.start > RATE_WINDOW) {
    ipEntry.count = 0;
    ipEntry.start = now;
  }
  ipEntry.count++;
  rateLimit.set(ip, ipEntry);
  if (ipEntry.count > RATE_MAX) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Check cache
  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY_KEY)}&q=${encodeURIComponent(query)}&image_type=photo&safesearch=true&per_page=30`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Pixabay API error: ${response.status}`);
    }

    const json = await response.json();
    const images = (json.hits || []).map(hit => {
      const thumbId = `t_${hit.id}`;
      const fullId = `f_${hit.id}`;
      imageMap.set(thumbId, hit.webformatURL);
      imageMap.set(fullId, hit.largeImageURL);
      return {
        id: hit.id,
        thumbnail: `/api/image/${thumbId}`,
        full: `/api/image/${fullId}`,
        tags: hit.tags
      };
    });

    // Cache the result
    cache.set(cacheKey, { data: images, timestamp: now });

    // Clean old cache entries periodically
    if (cache.size > 100) {
      for (const [key, val] of cache) {
        if (now - val.timestamp > CACHE_TTL) cache.delete(key);
      }
    }

    res.json(images);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Picture Search running on http://localhost:${PORT}`);
});
