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

// Common misspellings kids/parents might type
const CORRECTIONS = {
  airplan: 'airplane', arplane: 'airplane', ariplane: 'airplane', aerplane: 'airplane',
  airplain: 'airplane', airplaen: 'airplane', aiplane: 'airplane',
  dinasaur: 'dinosaur', dinosuar: 'dinosaur', dinasor: 'dinosaur', dinosar: 'dinosaur',
  dinasour: 'dinosaur', dinsaur: 'dinosaur',
  elefant: 'elephant', elphant: 'elephant', elephent: 'elephant', elefent: 'elephant',
  jiraf: 'giraffe', giraf: 'giraffe', giraff: 'giraffe', jiraffe: 'giraffe',
  firetruck: 'fire truck', fiertruck: 'fire truck', firtruck: 'fire truck',
  policcar: 'police car', policecar: 'police car',
  butterly: 'butterfly', buterfly: 'butterfly', butterfy: 'butterfly',
  helecopter: 'helicopter', helicoptor: 'helicopter', helcopter: 'helicopter',
  ambulence: 'ambulance', amblulance: 'ambulance',
  motercycle: 'motorcycle', motorcicle: 'motorcycle', motocycle: 'motorcycle',
  baloon: 'balloon', ballon: 'balloon', balon: 'balloon',
  monky: 'monkey', monkee: 'monkey', munkey: 'monkey',
  pengin: 'penguin', pengwin: 'penguin', pegnuin: 'penguin',
  zeebra: 'zebra', zeba: 'zebra', zebrah: 'zebra',
  trane: 'train', trian: 'train',
  unicron: 'unicorn', unikorn: 'unicorn',
  rianbow: 'rainbow', ranbow: 'rainbow', rainbo: 'rainbow',
  crokodile: 'crocodile', crocadile: 'crocodile',
  hipopotamus: 'hippopotamus',
  rhinoseros: 'rhinoceros', rhinocerous: 'rhinoceros', rinoseros: 'rhinoceros',
  dolfin: 'dolphin', dolhpin: 'dolphin', dophin: 'dolphin',
  octapus: 'octopus', octpus: 'octopus', octopis: 'octopus',
  squirel: 'squirrel', squirl: 'squirrel', squrrel: 'squirrel',
  chetah: 'cheetah', cheeta: 'cheetah',
  leppard: 'leopard', lepard: 'leopard', leoperd: 'leopard',
  rabitt: 'rabbit', rabit: 'rabbit', rabbitt: 'rabbit',
  tutel: 'turtle', turle: 'turtle', turtl: 'turtle',
  catapillar: 'caterpillar', caterpiller: 'caterpillar', catapiller: 'caterpillar',
  strawbery: 'strawberry', stawberry: 'strawberry',
  brocoli: 'broccoli', broccolli: 'broccoli', brocolli: 'broccoli',
  choclate: 'chocolate', choclet: 'chocolate', chocolat: 'chocolate',
  sandwitch: 'sandwich', sandwhich: 'sandwich', sandwish: 'sandwich',
  excavater: 'excavator', exavator: 'excavator', excvator: 'excavator',
  dumptruck: 'dump truck', bulldoser: 'bulldozer',
  tracter: 'tractor', tracktor: 'tractor',
  rocketship: 'rocket ship', rocet: 'rocket', roket: 'rocket',
  solder: 'soldier', solider: 'soldier',
  pirat: 'pirate', pirite: 'pirate',
  prinses: 'princess', princes: 'princess', princss: 'princess',
  castel: 'castle', caslte: 'castle',
  volceno: 'volcano', volkano: 'volcano', vulcano: 'volcano',
  tornato: 'tornado', ternaido: 'tornado',
  lighning: 'lightning', lightening: 'lightning', litning: 'lightning',
};

function correctQuery(query) {
  const lower = query.toLowerCase();
  if (CORRECTIONS[lower]) return CORRECTIONS[lower];
  // Try correcting individual words in multi-word queries
  return lower.split(/\s+/).map(w => CORRECTIONS[w] || w).join(' ');
}

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

  // Correct common misspellings
  const corrected = correctQuery(query);

  // Check cache
  const cacheKey = corrected.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY_KEY)}&q=${encodeURIComponent(corrected)}&image_type=photo&safesearch=true&per_page=30`;
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
