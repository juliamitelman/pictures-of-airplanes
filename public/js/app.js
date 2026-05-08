// State
const state = {
  query: '',
  images: [],
  selectedIndex: -1,
  isFullscreen: false
};

// DOM elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const spinner = document.getElementById('spinner');

// Search
async function search(query) {
  query = query.trim();
  if (!query) return;

  state.query = query;
  grid.innerHTML = '';
  empty.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    const images = await res.json();
    state.images = images;
    renderGrid();
  } catch (err) {
    empty.textContent = 'Something went wrong. Try again!';
    empty.classList.remove('hidden');
  } finally {
    spinner.classList.add('hidden');
  }
}

// Render grid
function renderGrid() {
  grid.innerHTML = '';

  if (state.images.length === 0) {
    empty.textContent = 'No pictures found. Try something else!';
    empty.classList.remove('hidden');
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
