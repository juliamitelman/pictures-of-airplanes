// State
const state = {
  query: '',
  images: [],
  selectedIndex: -1,
  isFullscreen: false,
  page: 1,
  hasMore: true,
  loadingMore: false,
  gridDirty: false
};

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Preferences stored in localStorage
// favorites: { [imageId]: { query, id, thumbnail, full, tags } }
// hidden: [imageId, ...]
const prefs = {
  _favKey: 'pic_favorites',
  _hideKey: 'pic_hidden',

  getFavorites() {
    try { return JSON.parse(localStorage.getItem(this._favKey)) || {}; } catch { return {}; }
  },
  getHidden() {
    try { return JSON.parse(localStorage.getItem(this._hideKey)) || []; } catch { return []; }
  },
  saveFavorites(favs) {
    localStorage.setItem(this._favKey, JSON.stringify(favs));
  },
  saveHidden(hidden) {
    localStorage.setItem(this._hideKey, JSON.stringify(hidden));
  },

  isFavorite(id) {
    return !!this.getFavorites()[id];
  },
  isHidden(id) {
    return this.getHidden().includes(id);
  },

  toggleFavorite(id, query, imgData) {
    const favs = this.getFavorites();
    if (favs[id]) {
      delete favs[id];
    } else {
      favs[id] = { query: query.toLowerCase(), ...imgData };
    }
    this.saveFavorites(favs);
    return !!favs[id];
  },

  hideImage(id) {
    const hidden = this.getHidden();
    if (!hidden.includes(id)) {
      hidden.push(id);
      this.saveHidden(hidden);
    }
    // Also remove from favorites if it was there
    const favs = this.getFavorites();
    if (favs[id]) {
      delete favs[id];
      this.saveFavorites(favs);
    }
  },

  getFavoritesForQuery(query) {
    const favs = this.getFavorites();
    const q = query.toLowerCase();
    return Object.values(favs).filter(f => f.query === q);
  }
};

// DOM elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const spinner = document.getElementById('spinner');
const moreBtn = document.getElementById('more-btn');

// Search
async function search(query) {
  query = query.trim();
  if (!query) return;

  state.query = query;
  state.page = 1;
  state.hasMore = true;
  grid.innerHTML = '';
  empty.classList.add('hidden');
  moreBtn.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=1`);
    if (!res.ok) throw new Error('Search failed');
    const images = await res.json();

    // Filter out hidden images
    const hidden = prefs.getHidden();
    const filtered = images.filter(img => !hidden.includes(img.id));

    // Split filtered into favorites and non-favorites
    const favsInFiltered = [];
    const nonFavs = [];
    for (const img of filtered) {
      if (prefs.isFavorite(img.id)) favsInFiltered.push(img);
      else nonFavs.push(img);
    }

    // Add favorites for this query that aren't already in the results
    const favImagesForQuery = prefs.getFavoritesForQuery(query);
    const resultIds = new Set(filtered.map(img => img.id));
    const favToAdd = favImagesForQuery.filter(f => !resultIds.has(f.id) && !hidden.includes(f.id));

    // Favorites pinned first (in their natural order), then everything else shuffled
    state.images = [...favToAdd, ...favsInFiltered, ...shuffleArr(nonFavs)];

    if (filtered.length === 0) state.hasMore = false;
    renderGrid();
  } catch (err) {
    empty.textContent = 'Something went wrong. Try again!';
    empty.classList.remove('hidden');
  } finally {
    spinner.classList.add('hidden');
  }
}

async function loadMore() {
  if (state.loadingMore || !state.hasMore || !state.query) return;
  state.loadingMore = true;
  moreBtn.disabled = true;
  moreBtn.textContent = 'Loading…';

  try {
    state.page += 1;
    const res = await fetch(`/api/search?q=${encodeURIComponent(state.query)}&page=${state.page}`);
    if (!res.ok) throw new Error('Load more failed');
    const images = await res.json();

    const hidden = prefs.getHidden();
    const existingIds = new Set(state.images.map(img => img.id));
    const fresh = images.filter(img => !hidden.includes(img.id) && !existingIds.has(img.id));

    if (fresh.length === 0) {
      state.hasMore = false;
    } else {
      state.images.push(...shuffleArr(fresh));
    }
    renderGrid();
  } catch (err) {
    state.page -= 1;
  } finally {
    state.loadingMore = false;
    moreBtn.disabled = false;
    moreBtn.textContent = 'More pictures';
  }
}

moreBtn.addEventListener('click', loadMore);

// Render grid
function renderGrid() {
  grid.innerHTML = '';

  if (state.images.length === 0) {
    empty.textContent = 'No pictures found. Try something else!';
    empty.classList.remove('hidden');
    moreBtn.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');

  state.images.forEach((img, index) => {
    const item = document.createElement('div');
    item.className = 'grid-item';

    const imgEl = document.createElement('img');
    imgEl.src = img.thumbnail;
    imgEl.alt = img.tags;
    imgEl.loading = 'lazy';
    imgEl.draggable = false;

    item.addEventListener('click', () => {
      openFullscreen(index);
    });

    item.appendChild(imgEl);
    grid.appendChild(item);
  });

  moreBtn.classList.toggle('hidden', !state.hasMore);
}

// Search form submit
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  searchInput.blur();
  search(searchInput.value);
});

// Voice search
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  voiceBtn.addEventListener('click', () => {
    if (voiceBtn.classList.contains('listening')) {
      recognition.abort();
      return;
    }
    voiceBtn.classList.add('listening');
    recognition.start();
  });

  recognition.addEventListener('result', (e) => {
    const transcript = e.results[0][0].transcript;
    searchInput.value = transcript;
    recognition.abort();
    voiceBtn.classList.remove('listening');
    search(transcript);
  });

  recognition.addEventListener('end', () => {
    voiceBtn.classList.remove('listening');
  });

  recognition.addEventListener('error', () => {
    recognition.abort();
    voiceBtn.classList.remove('listening');
  });
} else {
  voiceBtn.style.display = 'none';
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
