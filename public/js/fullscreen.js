// Fullscreen viewer with swipe and long-press
(function () {
  const overlay = document.getElementById('fullscreen');
  const closeBtn = document.getElementById('close-btn');
  const fsImage = document.getElementById('fs-image');
  const fsTags = document.getElementById('fs-tags');

  // Swipe tracking
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let isSwiping = false;

  // Long press
  let longPressTimer = null;

  // Open fullscreen
  window.openFullscreen = function (index) {
    state.selectedIndex = index;
    state.isFullscreen = true;
    showCurrentImage();
    overlay.classList.remove('hidden');
    fsTags.classList.add('hidden');
    history.pushState({ fullscreen: true }, '');
    preloadAdjacent();
  };

  // Close fullscreen
  function closeFullscreen() {
    state.isFullscreen = false;
    state.selectedIndex = -1;
    overlay.classList.add('hidden');
    fsImage.src = '';
    fsTags.classList.add('hidden');
  }

  // Show current image
  function showCurrentImage() {
    const img = state.images[state.selectedIndex];
    if (!img) return;
    fsImage.src = img.full;
    fsImage.alt = img.tags;
    fsImage.style.transform = '';
    fsImage.classList.remove('swiping');
  }

  // Navigate
  function nextImage() {
    if (state.selectedIndex < state.images.length - 1) {
      state.selectedIndex++;
      showCurrentImage();
      preloadAdjacent();
    }
  }

  function prevImage() {
    if (state.selectedIndex > 0) {
      state.selectedIndex--;
      showCurrentImage();
      preloadAdjacent();
    }
  }

  // Preload adjacent images
  function preloadAdjacent() {
    const idx = state.selectedIndex;
    [idx - 1, idx + 1].forEach(i => {
      if (i >= 0 && i < state.images.length) {
        const preload = new Image();
        preload.src = state.images[i].full;
      }
    });
  }

  // Close button
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.isFullscreen) {
      history.back();
    }
  });

  // Back button support
  window.addEventListener('popstate', () => {
    if (state.isFullscreen) {
      closeFullscreen();
    }
  });

  // Touch events for swipe and long press
  overlay.addEventListener('touchstart', (e) => {
    if (e.target === closeBtn || closeBtn.contains(e.target)) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchCurrentX = touch.clientX;
    isSwiping = false;

    // Start long press timer
    longPressTimer = setTimeout(() => {
      showTags();
    }, 500);
  }, { passive: true });

  overlay.addEventListener('touchmove', (e) => {
    if (!state.isFullscreen) return;
    const touch = e.touches[0];
    touchCurrentX = touch.clientX;
    const deltaX = touchCurrentX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // Cancel long press on any movement
    if (longPressTimer && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // Track horizontal swipe
    if (Math.abs(deltaX) > 20 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwiping = true;
      fsImage.classList.add('swiping');
      fsImage.style.transform = `translateX(${deltaX}px)`;
    }
  }, { passive: true });

  overlay.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;

    if (isSwiping) {
      const deltaX = touchCurrentX - touchStartX;
      if (Math.abs(deltaX) > 50) {
        if (deltaX < 0) {
          nextImage();
        } else {
          prevImage();
        }
      } else {
        // Snap back
        fsImage.classList.remove('swiping');
        fsImage.style.transform = '';
      }
      isSwiping = false;
    }
  }, { passive: true });

  overlay.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    isSwiping = false;
    fsImage.classList.remove('swiping');
    fsImage.style.transform = '';
  }, { passive: true });

  // Show tags
  function showTags() {
    const img = state.images[state.selectedIndex];
    if (!img) return;
    fsTags.textContent = img.tags;
    fsTags.classList.remove('hidden');
    // Re-trigger animation
    fsTags.style.animation = 'none';
    fsTags.offsetHeight; // force reflow
    fsTags.style.animation = '';

    setTimeout(() => {
      fsTags.classList.add('hidden');
    }, 2500);
  }

  // Keyboard support (for desktop testing)
  document.addEventListener('keydown', (e) => {
    if (!state.isFullscreen) return;
    if (e.key === 'Escape') {
      history.back();
    } else if (e.key === 'ArrowLeft') {
      prevImage();
    } else if (e.key === 'ArrowRight') {
      nextImage();
    }
  });
})();
