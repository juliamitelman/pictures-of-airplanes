// Fullscreen viewer with swipe and long-press
(function () {
  const overlay = document.getElementById('fullscreen');
  const closeBtn = document.getElementById('close-btn');
  const favBtn = document.getElementById('fav-btn');
  const hideBtn = document.getElementById('hide-btn');
  const fsImage = document.getElementById('fs-image');
  const fsImagePrev = document.getElementById('fs-image-prev');
  const fsImageNext = document.getElementById('fs-image-next');
  const fsTags = document.getElementById('fs-tags');

  // Swipe tracking
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let touchCurrentY = 0;
  let swipeDir = null; // 'h' | 'v' | null
  let isAnimating = false;
  const HORIZ_COMMIT = 50;
  const VERTICAL_DISMISS = 100;
  const SLIDE_MS = 250;
  const DISMISS_MS = 220;

  // Long press
  let longPressTimer = null;

  function updateControlButtons() {
    const img = state.images[state.selectedIndex];
    if (!img) return;
    favBtn.classList.toggle('active', prefs.isFavorite(img.id));
    hideBtn.classList.remove('active');
  }

  // Open fullscreen
  window.openFullscreen = function (index) {
    state.selectedIndex = index;
    state.isFullscreen = true;
    state.gridDirty = false;
    showCurrentImage();
    updateControlButtons();
    overlay.classList.remove('hidden');
    overlay.classList.remove('dismissing');
    overlay.style.opacity = '';
    fsTags.classList.add('hidden');
    history.pushState({ fullscreen: true }, '');
    preloadAdjacent();
  };

  // Close fullscreen
  function closeFullscreen() {
    const wasDirty = state.gridDirty;
    state.isFullscreen = false;
    state.selectedIndex = -1;
    state.gridDirty = false;
    overlay.classList.add('hidden');
    overlay.classList.remove('dismissing');
    overlay.style.opacity = '';
    fsImage.src = '';
    fsImagePrev.src = '';
    fsImageNext.src = '';
    snapTransforms();
    fsTags.classList.add('hidden');
    isAnimating = false;
    // Only re-render the grid if its contents actually changed (e.g. an image
    // was hidden); otherwise leave the existing DOM alone to avoid a flash of
    // unstyled / reloading thumbnails.
    if (wasDirty) renderGrid();
  }

  function setSideSrc(el, img) {
    if (img) {
      el.src = img.full;
      el.alt = img.tags;
    } else {
      el.src = '';
      el.alt = '';
    }
  }

  // Show current image. If `instant` is true, snap transforms back to default
  // without animating — used after a commit-slide so the new content doesn't
  // appear to bounce back from the edge.
  function showCurrentImage(instant) {
    const img = state.images[state.selectedIndex];
    if (!img) return;
    fsImage.src = img.full;
    fsImage.alt = img.tags;
    setSideSrc(fsImagePrev, state.images[state.selectedIndex - 1]);
    setSideSrc(fsImageNext, state.images[state.selectedIndex + 1]);
    if (instant) {
      snapTransforms();
    } else {
      animateTransformsToCenter();
    }
    updateControlButtons();
  }

  // Reset transforms with no animation (transition disabled).
  function snapTransforms() {
    fsImage.classList.add('swiping');
    fsImagePrev.classList.add('swiping');
    fsImageNext.classList.add('swiping');
    fsImage.style.transform = '';
    fsImagePrev.style.transform = '';
    fsImageNext.style.transform = '';
    overlay.style.opacity = '';
    // Force reflow so the next class removal doesn't animate from old state.
    void fsImage.offsetHeight;
    fsImage.classList.remove('swiping');
    fsImagePrev.classList.remove('swiping');
    fsImageNext.classList.remove('swiping');
  }

  // Reset transforms with the default CSS transition active.
  function animateTransformsToCenter() {
    fsImage.classList.remove('swiping');
    fsImagePrev.classList.remove('swiping');
    fsImageNext.classList.remove('swiping');
    fsImage.style.transform = '';
    fsImagePrev.style.transform = '';
    fsImageNext.style.transform = '';
    overlay.style.opacity = '';
  }

  function setHorizontalTransform(dx) {
    fsImage.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
    fsImagePrev.style.transform = `translate(calc(-50% - 100vw + ${dx}px), -50%)`;
    fsImageNext.style.transform = `translate(calc(-50% + 100vw + ${dx}px), -50%)`;
  }

  function applyHorizontalSwipe(dx) {
    // Resist swipes past the start/end where there's no neighbor to reveal.
    const atFirst = state.selectedIndex === 0;
    const atLast = state.selectedIndex === state.images.length - 1;
    if (atFirst && dx > 0) dx = dx * 0.3;
    if (atLast && dx < 0) dx = dx * 0.3;
    setHorizontalTransform(dx);
  }

  function applyVerticalSwipe(dy) {
    const cleanDy = Math.min(0, dy);
    fsImage.style.transform = `translate(-50%, calc(-50% + ${cleanDy}px))`;
    const fade = Math.max(0.4, 1 - Math.abs(cleanDy) / 400);
    overlay.style.opacity = String(fade);
  }

  // Slide the rest of the way to a neighbor, then update content in place.
  function commitHorizontalSwipe(direction) {
    isAnimating = true;
    fsImage.classList.remove('swiping');
    fsImagePrev.classList.remove('swiping');
    fsImageNext.classList.remove('swiping');
    const targetDx = direction === 1 ? -window.innerWidth : window.innerWidth;
    setHorizontalTransform(targetDx);
    setTimeout(() => {
      state.selectedIndex += direction;
      showCurrentImage(true);
      preloadAdjacent();
      isAnimating = false;
    }, SLIDE_MS);
  }

  // Continue an upward swipe off-screen and fade the overlay before closing.
  function commitDismissUp() {
    isAnimating = true;
    fsImage.classList.remove('swiping');
    fsImagePrev.classList.remove('swiping');
    fsImageNext.classList.remove('swiping');
    fsImage.style.transform = `translate(-50%, calc(-50% - 100vh))`;
    overlay.classList.add('dismissing');
    void overlay.offsetHeight; // ensure transition is registered before opacity flips
    overlay.style.opacity = '0';
    setTimeout(() => {
      history.back();
    }, DISMISS_MS);
  }

  // Snap back to center when a swipe doesn't pass the threshold.
  function snapBackToCenter() {
    animateTransformsToCenter();
  }

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

  function preloadAdjacent() {
    const idx = state.selectedIndex;
    [idx - 1, idx + 1].forEach(i => {
      if (i >= 0 && i < state.images.length) {
        const preload = new Image();
        preload.src = state.images[i].full;
      }
    });
  }

  // Favorite button
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const img = state.images[state.selectedIndex];
    if (!img) return;
    const isFav = prefs.toggleFavorite(img.id, state.query, {
      id: img.id, thumbnail: img.thumbnail, full: img.full, tags: img.tags
    });
    favBtn.classList.toggle('active', isFav);
  });

  // Hide button
  hideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const img = state.images[state.selectedIndex];
    if (!img) return;
    prefs.hideImage(img.id);
    state.images.splice(state.selectedIndex, 1);
    state.gridDirty = true;
    if (state.images.length === 0) {
      history.back();
      return;
    }
    if (state.selectedIndex >= state.images.length) {
      state.selectedIndex = state.images.length - 1;
    }
    showCurrentImage(true);
    preloadAdjacent();
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.isFullscreen) history.back();
  });

  window.addEventListener('popstate', () => {
    if (state.isFullscreen) closeFullscreen();
  });

  // Touch events for swipe and long press
  overlay.addEventListener('touchstart', (e) => {
    if (isAnimating) return;
    if (e.target === closeBtn || closeBtn.contains(e.target)) return;
    if (e.target === favBtn || favBtn.contains(e.target)) return;
    if (e.target === hideBtn || hideBtn.contains(e.target)) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchCurrentX = touch.clientX;
    touchCurrentY = touch.clientY;
    swipeDir = null;

    longPressTimer = setTimeout(() => {
      showTags();
    }, 500);
  }, { passive: true });

  overlay.addEventListener('touchmove', (e) => {
    if (!state.isFullscreen || isAnimating) return;
    const touch = e.touches[0];
    touchCurrentX = touch.clientX;
    touchCurrentY = touch.clientY;
    const deltaX = touchCurrentX - touchStartX;
    const deltaY = touchCurrentY - touchStartY;

    if (longPressTimer && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (!swipeDir && (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12)) {
      swipeDir = Math.abs(deltaY) > Math.abs(deltaX) ? 'v' : 'h';
      fsImage.classList.add('swiping');
      fsImagePrev.classList.add('swiping');
      fsImageNext.classList.add('swiping');
    }

    if (swipeDir === 'h') {
      applyHorizontalSwipe(deltaX);
    } else if (swipeDir === 'v') {
      applyVerticalSwipe(deltaY);
    }
  }, { passive: true });

  overlay.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (isAnimating) return;

    const deltaX = touchCurrentX - touchStartX;
    const deltaY = touchCurrentY - touchStartY;

    if (swipeDir === 'h') {
      const direction = deltaX < 0 ? 1 : -1;
      const atFirst = state.selectedIndex === 0;
      const atLast = state.selectedIndex === state.images.length - 1;
      const blocked = (direction === 1 && atLast) || (direction === -1 && atFirst);
      if (Math.abs(deltaX) > HORIZ_COMMIT && !blocked) {
        commitHorizontalSwipe(direction);
      } else {
        snapBackToCenter();
      }
    } else if (swipeDir === 'v') {
      if (deltaY < -VERTICAL_DISMISS) {
        commitDismissUp();
      } else {
        snapBackToCenter();
      }
    }
    swipeDir = null;
  }, { passive: true });

  overlay.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    swipeDir = null;
    if (!isAnimating) snapBackToCenter();
  }, { passive: true });

  function showTags() {
    const img = state.images[state.selectedIndex];
    if (!img) return;
    fsTags.textContent = img.tags;
    fsTags.classList.remove('hidden');
    fsTags.style.animation = 'none';
    fsTags.offsetHeight;
    fsTags.style.animation = '';
    setTimeout(() => {
      fsTags.classList.add('hidden');
    }, 2500);
  }

  document.addEventListener('keydown', (e) => {
    if (!state.isFullscreen) return;
    if (e.key === 'Escape') {
      history.back();
    } else if (e.key === 'ArrowLeft') {
      prevImage();
    } else if (e.key === 'ArrowRight') {
      nextImage();
    } else if (e.key === 'ArrowUp') {
      history.back();
    }
  });
})();
