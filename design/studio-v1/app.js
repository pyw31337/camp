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

const CARD_SPEC_FALLBACKS = [
  ['시설', '기본 정보'],
  ['콘텐츠', '현장 사진'],
  ['정보', '상세 보기'],
];

function resolveCardSpecs(source) {
  const preferred = [
    ['사이트', source.site],
    ['현장', source.field],
    ['예약', source.booking],
  ];
  return preferred.map(([label, value], index) => {
    if (value) return { label, value };
    return { label: CARD_SPEC_FALLBACKS[index][0], value: source[`fallback${index + 1}`] || CARD_SPEC_FALLBACKS[index][1] };
  });
}

function renderCardSpecs(rows, className = 'quick-specs') {
  return `<dl class="${className}">${rows.map((row, index) => `<div><dt>0${index + 1}</dt><dd>${row.label}<b>${row.value}</b></dd></div>`).join('')}</dl>`;
}

all('[data-card-specs]').forEach((list) => {
  list.innerHTML = renderCardSpecs(resolveCardSpecs({
    site: list.dataset.site,
    field: list.dataset.field,
    booking: list.dataset.booking,
    fallback1: list.dataset.fallback1,
    fallback2: list.dataset.fallback2,
    fallback3: list.dataset.fallback3,
  })).replace(/^<dl class="quick-specs">|<\/dl>$/g, '');
});

const themeCatalog = [
  { id: 'gugok', name: '구곡폭포 국민여가캠핑장', region: '강원 춘천 · 일반 10', image: 'forest.webp', info: '정보 14', site: '일반 10면', field: '1.1kW · 장작', booking: '예약 경로', tags: ['info', 'valley', 'forest', 'family'] },
  { id: 'samwon', name: '삼원레져타운 캠핑장', region: '충남 서산 · 일반 80', image: 'lake.webp', info: '정보 14', site: '6×8m · 80면', field: '전기 · 화로대', booking: '네이버 예약', tags: ['info', 'water', 'pet', 'family'] },
  { id: 'yangchon', name: '양촌어울 체험캠프', region: '경남 창원 · 일반 38', image: 'valley.webp', info: '정보 12', site: '일반 38면', field: '온수 · 체험', booking: '', fallback3: '사진 12장', tags: ['info', 'valley', 'family', 'forest'] },
  { id: 'muchangpo', name: '무창포오토캠핑장', region: '충남 보령 · 오토', image: 'caravan.webp', info: '정보 11', site: '오토 · 해변', field: '전기 제공', booking: '예약 경로', tags: ['info', 'water', 'family', 'glamping'] },
  { id: 'mulsori', name: '물소리 오토캠핑장', region: '강원 홍천 · 오토', image: 'valley.webp', info: '정보 12', site: '7×8m · 파쇄석', field: '1.1kW · 차박', booking: '온라인 예약', tags: ['info', 'valley', 'forest', 'pet'] },
  { id: 'duta', name: '두타산 자연휴양림', region: '강원 평창 · 숲나들e', image: 'forest.webp', info: '정보 10', site: '야영 · 숲길', field: '산책 · 온수', booking: '숲나들e', tags: ['info', 'valley', 'water', 'family', 'forest', 'free'] },
  { id: 'bibi', name: '안면도 비비앤조이 캠핑장', region: '충남 태안 · 글램핑 19', image: 'lake.webp', info: '정보 13', site: '글램핑 · 19실', field: '전기 · 장작', booking: '온라인 예약', tags: ['water', 'glamping', 'pet', 'family'] },
  { id: 'hans', name: '양양한스 오토캠핑장', region: '강원 양양 · 오토 27', image: 'kids.webp', info: '정보 10', site: '오토 · 27면', field: '전기 · 반려견', booking: '', fallback3: '후기 8건', tags: ['water', 'family', 'pet', 'glamping'] },
  { id: 'pado', name: '파도빛 캠프', region: '인천 강화 · 카라반', image: 'caravan.webp', info: '정보 9', site: '카라반 · 오토', field: '외부 주차 · 숯만', booking: '온라인 예약', tags: ['water', 'glamping', 'pet', 'family'] },
  { id: 'byeolbit', name: '별빛계곡 캠핑장', region: '경북 청도 · 일반', image: 'valley.webp', info: '정보 8', site: '일반 · 계곡', field: '전기 제공', booking: '', fallback3: '공식 사진 8장', tags: ['valley', 'forest', 'pet', 'family'] },
  { id: 'sonamu', name: '소나무 계곡야영장', region: '전북 무주 · 공영', image: 'forest.webp', info: '정보 7', site: '야영 · 공영', field: '', booking: '현장 문의', fallback2: '산책로', tags: ['valley', 'forest', 'free', 'family'] },
  { id: 'noeul', name: '노을항 카라반', region: '전남 여수 · 카라반', image: 'caravan.webp', info: '정보 9', site: '카라반 · 바다', field: '외부 주차', booking: '온라인 예약', tags: ['water', 'glamping', 'pet'] },
  { id: 'dogforest', name: '강아지숲 캠프', region: '강원 홍천 · 일반', image: 'kids.webp', info: '정보 11', site: '일반 · 반려견', field: '산책 · 전기', booking: '예약 경로', tags: ['pet', 'forest', 'family'] },
  { id: 'kidsglamp', name: '아이숲 글램핑', region: '경기 가평 · 글램핑', image: 'kids.webp', info: '정보 10', site: '글램핑 · 가족', field: '놀이 · 온수', booking: '온라인 예약', tags: ['family', 'glamping', 'forest', 'pet'] },
  { id: 'livingforest', name: '리빙포레스트 야영장', region: '충북 제천 · 공영', image: 'forest.webp', info: '정보 8', site: '야영 · 숲', field: '산책로', booking: '', fallback3: '공식 안내', tags: ['forest', 'free', 'valley'] },
  { id: 'kimcheon', name: '국립김천숲속야영장', region: '경북 김천 · 숲나들e', image: 'forest.webp', info: '정보 12', site: '숲속 야영', field: '전기 제공', booking: '숲나들e', tags: ['forest', 'free', 'family', 'valley'] },
  { id: 'jayu', name: '자유마당 공영야영장', region: '충남 공주 · 공영', image: 'lake.webp', info: '정보 6', site: '공영 · 야영', field: '', booking: '', fallback2: '주변 화장실', fallback3: '공식 안내', tags: ['free', 'water', 'family', 'forest'] },
];

const themeGrid = document.querySelector('[data-theme-grid]');
const themeRange = document.querySelector('[data-theme-range]');
const themeOutput = document.querySelector('[data-theme-page-output]');
const themeTabs = all('.theme-tabs button');
let activeTheme = 'info';
let activeThemePage = 1;
let suppressThemeCardOpen = false;

function themeCardsFor(theme) {
  return themeCatalog.filter((camp) => camp.tags.includes(theme));
}

function renderThemeCards() {
  if (!themeGrid || !themeRange || !themeOutput) return;
  const cards = themeCardsFor(activeTheme);
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  activeThemePage = Math.min(activeThemePage, totalPages);
  themeRange.max = String(totalPages);
  themeRange.value = String(activeThemePage);
  themeRange.style.setProperty('--theme-page-pct', `${totalPages === 1 ? 100 : ((activeThemePage - 1) / (totalPages - 1)) * 100}%`);
  themeRange.disabled = totalPages === 1;
  themeOutput.textContent = `${String(activeThemePage).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`;
  const page = cards.slice((activeThemePage - 1) * pageSize, activeThemePage * pageSize);
  themeGrid.innerHTML = page.map((camp) => `<article class="theme-camp-card" role="button" tabindex="0" aria-label="${camp.name} 상세 보기"><div class="theme-camp-image"><img src="./assets/${camp.image}" alt="${camp.name} 풍경 시안" /><span>${camp.info}</span></div><div><small>${camp.region}</small><h3>${camp.name}</h3>${renderCardSpecs(resolveCardSpecs(camp), 'theme-card-specs')}</div></article>`).join('');
  themeGrid.classList.remove('is-entering');
  requestAnimationFrame(() => themeGrid.classList.add('is-entering'));
}

function setThemePage(nextPage) {
  const totalPages = Math.max(1, Math.ceil(themeCardsFor(activeTheme).length / 4));
  const normalized = ((nextPage - 1 + totalPages) % totalPages) + 1;
  if (normalized === activeThemePage && themeGrid?.children.length) return;
  activeThemePage = normalized;
  renderThemeCards();
}

themeTabs.forEach((button) => button.addEventListener('click', () => {
  activeTheme = button.dataset.theme;
  activeThemePage = 1;
  themeTabs.forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  renderThemeCards();
}));

themeRange?.addEventListener('input', () => setThemePage(Number(themeRange.value)));
document.querySelector('[data-theme-prev]')?.addEventListener('click', () => setThemePage(activeThemePage - 1));
document.querySelector('[data-theme-next]')?.addEventListener('click', () => setThemePage(activeThemePage + 1));

let themeSwipeStartX = null;
themeGrid?.addEventListener('pointerdown', (event) => {
  themeSwipeStartX = event.clientX;
  themeGrid.setPointerCapture?.(event.pointerId);
});
themeGrid?.addEventListener('pointerup', (event) => {
  if (themeSwipeStartX === null) return;
  const distance = event.clientX - themeSwipeStartX;
  themeSwipeStartX = null;
  if (Math.abs(distance) < 34) return;
  suppressThemeCardOpen = true;
  setThemePage(activeThemePage + (distance < 0 ? 1 : -1));
  window.setTimeout(() => { suppressThemeCardOpen = false; }, 0);
});
themeGrid?.addEventListener('pointercancel', () => { themeSwipeStartX = null; });
themeGrid?.addEventListener('click', () => {
  if (suppressThemeCardOpen) return;
  setScreen('detail');
});
themeGrid?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    setScreen('detail');
  }
});
renderThemeCards();

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

all('[data-booking-cta], .price-link').forEach((button) => button.addEventListener('click', () => showToast('검증된 공식 예약 경로에서 날짜별 요금과 빈자리를 확인해요')));

all('.renewal-review-tabs, .nearby-category-tabs, .renewal-comment-types').forEach((group) => {
  all('button', group).forEach((button) => button.addEventListener('click', () => {
    all('button', group).forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      if (item.getAttribute('role') === 'tab') item.setAttribute('aria-selected', String(active));
    });
  }));
});

all('[data-roadview-cta]').forEach((button) => button.addEventListener('click', () => {
  showToast('실서비스에서는 확인된 장소 좌표로 로드뷰를 열어요');
}));

all('[data-copy-address]').forEach((button) => button.addEventListener('click', async () => {
  const address = '충청남도 서산시 팔봉면 진장서낭골길 204';
  try { await navigator.clipboard?.writeText(address); } catch { /* clipboard permission is optional in this prototype */ }
  showToast('주소를 복사했어요');
}));

all('[data-comment-form]').forEach((form) => form.addEventListener('submit', (event) => {
  event.preventDefault();
  const nickname = form.elements.nickname?.value.trim() || '캠퍼';
  const text = form.elements.comment?.value.trim();
  if (!text) {
    showToast('한마디를 입력해 주세요');
    return;
  }
  const list = document.querySelector('[data-comment-list]');
  const count = document.querySelector('[data-comment-count]');
  const empty = list?.querySelector('.renewal-comment-empty');
  empty?.remove();
  const item = document.createElement('article');
  item.className = 'renewal-comment';
  const author = document.createElement('b');
  author.textContent = nickname;
  const time = document.createElement('time');
  time.textContent = '방금';
  const body = document.createElement('p');
  body.textContent = text;
  item.append(author, time, body);
  list?.prepend(item);
  const total = list?.querySelectorAll('.renewal-comment').length || 0;
  if (count) count.textContent = `${total}개`;
  form.reset();
  showToast('시안에 한마디를 추가했어요');
}));
