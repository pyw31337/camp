const all = (selector, root = document) => [...root.querySelectorAll(selector)];

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
}));

all('.heart').forEach((button) => button.addEventListener('click', () => {
  const isSaved = button.classList.toggle('is-saved');
  button.textContent = isSaved ? '♥' : '♡';
  button.setAttribute('aria-label', isSaved ? '관심에서 제거' : '관심 추가');
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
