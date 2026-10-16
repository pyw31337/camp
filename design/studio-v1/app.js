const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const toastRegion = document.querySelector('.toast-region');
let toastTimer;
function showToast(message, { loading = false } = {}) {
  if (!toastRegion) return;
  clearTimeout(toastTimer);
  toastRegion.innerHTML = `<div class="toast${loading ? ' is-loading' : ''}">${message}</div>`;
  if (!loading) toastTimer = window.setTimeout(() => { toastRegion.innerHTML = ''; }, 2600);
}

function setScreen(name) {
  all('.screen').forEach((screen) => screen.classList.toggle('is-active', screen.dataset.screen === name));
  all('[data-screen-target]').forEach((button) => button.classList.toggle('is-active', button.dataset.screenTarget === name && button.closest('.screen-nav')));
  document.body.classList.toggle('is-hero-header', name === 'explore');
  document.querySelector('.topbar').classList.toggle('is-scrolled', name !== 'explore');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const topbar = document.querySelector('.topbar');
const syncHeader = () => {
  if (!document.body.classList.contains('is-hero-header')) return;
  topbar.classList.toggle('is-scrolled', window.scrollY > 12);
};
window.addEventListener('scroll', syncHeader, { passive: true });
syncHeader();

all('[data-screen-target]').forEach((button) => button.addEventListener('click', () => setScreen(button.dataset.screenTarget)));

all('.finder-tab').forEach((button) => button.addEventListener('click', () => {
  all('.finder-tab').forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  if (button.dataset.findMode === 'map') setScreen('map');
}));

all('.condition-pill').forEach((button) => button.addEventListener('click', () => {
  all('.condition-pill').forEach((pill) => pill.classList.toggle('is-active', pill === button));
  showToast(`‘${button.textContent.trim()}’ 조건을 적용했어요`);
}));

all('.heart').forEach((button) => button.addEventListener('click', () => {
  const isSaved = button.classList.toggle('is-saved');
  button.textContent = isSaved ? '♥' : '♡';
  button.setAttribute('aria-label', isSaved ? '관심에서 제거' : '관심 추가');
  showToast(isSaved ? '내 캠핑에 저장했어요' : '관심에서 뺐어요');
}));

all('.card-open, .camp-card').forEach((element) => element.addEventListener('click', (event) => {
  if (event.target.closest('.photo-carousel, .heart')) return;
  setScreen('detail');
}));

all('[data-gallery]').forEach((gallery) => {
  const images = all(':scope > img', gallery);
  const dots = all('.photo-index i', gallery);
  const counter = gallery.querySelector('.photo-index b');
  let current = 0;
  let startX = null;
  const render = (index) => {
    current = (index + images.length) % images.length;
    images.forEach((image, imageIndex) => image.classList.toggle('is-current', imageIndex === current));
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-on', dotIndex === current));
    counter.textContent = `${current + 1}/${images.length}`;
  };
  gallery.addEventListener('pointerdown', (event) => { startX = event.clientX; gallery.setPointerCapture?.(event.pointerId); });
  gallery.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 24) render(current + (delta < 0 ? 1 : -1));
    startX = null;
  });
  gallery.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    render(current + 1);
  });
});

const rangeInput = document.querySelector('#priceRange');
const rangeFill = document.querySelector('.range-track span');
const rangeEnd = document.querySelector('.range-end');
const rangeOutput = document.querySelector('#priceRangeValue');
const updatePriceRange = () => {
  if (!rangeInput || !rangeFill || !rangeEnd || !rangeOutput) return;
  const min = Number(rangeInput.min), max = Number(rangeInput.max), value = Number(rangeInput.value);
  const pct = ((value - min) / (max - min)) * 100;
  rangeFill.style.width = `${pct}%`;
  rangeEnd.style.left = `${pct}%`;
  rangeOutput.value = `3만 — ${value}만원대`;
  rangeOutput.textContent = rangeOutput.value;
};
rangeInput?.addEventListener('input', updatePriceRange);
rangeInput?.addEventListener('change', () => showToast(`1박 ${rangeOutput.textContent}으로 골랐어요`));
updatePriceRange();

all('[data-choice-group]').forEach((group) => {
  const single = group.dataset.choiceMode === 'single';
  all('.choice-option', group).forEach((option) => option.addEventListener('click', () => {
    if (single) all('.choice-option', group).forEach((item) => item.classList.toggle('is-active', item === option));
    else window.setTimeout(() => option.classList.toggle('is-active', option.querySelector('input')?.checked));
  }));
});

all('.pagination button:not(.page-arrow)').forEach((button) => button.addEventListener('click', () => {
  all('.pagination button:not(.page-arrow)').forEach((page) => {
    const active = page === button;
    page.classList.toggle('is-active', active);
    page.toggleAttribute('aria-current', active);
  });
  showToast(`${button.textContent.trim()}페이지 결과예요`);
}));

all('.theme-tabs button').forEach((button) => button.addEventListener('click', () => {
  all('.theme-tabs button').forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  showToast(`‘${button.textContent.trim()}’ 테마를 골랐어요`);
}));

all('.collection-link').forEach((button) => button.addEventListener('click', () => showToast('전체 목록은 실제 탐색 화면에서 이어집니다')));

document.querySelector('.search-button')?.addEventListener('click', (buttonEvent) => {
  const button = buttonEvent.currentTarget;
  button.classList.add('is-loading');
  showToast('조건에 맞는 캠핑장을 찾는 중이에요', { loading: true });
  window.setTimeout(() => {
    button.classList.remove('is-loading');
    showToast('2,502곳을 찾았어요');
    document.querySelector('.results-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 520);
});

all('.info-small').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  const wasOpen = button.classList.contains('is-tip-open');
  all('.info-small').forEach((item) => item.classList.remove('is-tip-open'));
  button.classList.toggle('is-tip-open', !wasOpen);
}));
document.addEventListener('click', () => all('.info-small').forEach((button) => button.classList.remove('is-tip-open')));

all('[data-booking-cta], .price-link').forEach((button) => button.addEventListener('click', () => showToast('예약처에서 날짜별 요금과 빈자리를 확인해요')));
