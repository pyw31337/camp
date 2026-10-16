const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DATA_URL = '../explore/data/campgrounds.json';
const detailUrl = id => '../explore/data/camps/' + encodeURIComponent(id) + '.json';
const MAX_PHOTOS = 5;
const ICON = {
  power: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.2 2-8 11h5.9L10.8 22l8-12h-5.6z"/></svg>',
  fire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 2.4c.8 4.1-2.8 5.4-2.8 8.5 0 1.8 1.2 3.2 2.7 3.2.6 0 1.2-.2 1.6-.7.7-1 .2-2.5-.4-3.4 3.1 1.3 4.8 4 4.8 6.8 0 3.3-2.5 5.8-5.9 5.8S6.2 20.1 6.2 16.8c0-5 3.5-7.8 5.9-14.4Z"/></svg>',
  parking: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h7.1a4.9 4.9 0 0 1 0 9.8H9.5V22H6V2Zm3.5 3.2v3.4h3.4a1.7 1.7 0 0 0 0-3.4H9.5Z"/></svg>'
};

let catalog = [];
let visible = 8;
let activeFilter = 'all';
let activeTheme = 'all';
let query = '';
let selected = new Set();
const detailCache = new Map();

function safe(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function compactArea(camp) {
  return camp.sigungu ? (camp.sido + ' · ' + camp.sigungu).replace('특별자치도', '').replace('광역시', '') : camp.area;
}

function kindLabel(camp) {
  const labels = { AUTO_PITCH: '오토', PITCH: '일반', GLAMPING: '글램핑', CARAVAN_RENTAL: '카라반', RV_PITCH: '캠핑카' };
  return (camp.kinds ?? []).map(pair => (labels[pair[0]] ?? pair[0]) + ' ' + pair[1] + '면').slice(0, 2).join(' · ') || '캠핑장';
}

function largestSite(camp) {
  const sizes = camp.sizes ?? [];
  if (!sizes.length) return null;
  const size = [...sizes].sort((a, b) => (b[0] * b[1]) - (a[0] * a[1]))[0];
  return size[0] + '×' + size[1] + 'm' + (size[2] ? ' · ' + size[2] + '면' : '');
}

function bookingPlatform(channel) {
  if (channel?.platform_id) return channel.platform_id;
  const url = channel?.url ?? '';
  if (/camfit\.co\.kr/i.test(url)) return 'camfit';
  if (/booking\.naver\.com/i.test(url)) return 'naver';
  if (/thankqcamping\.com/i.test(url)) return 'thankqcamping';
  return null;
}

function primaryBooking(camp) {
  const published = camp.booking?.primary;
  if (published?.url) return published;
  const rank = { camfit: 0, naver: 10, thankqcamping: 20 };
  return [...(camp.booking?.channels ?? [])]
    .filter(channel => channel?.url)
    .sort((a, b) => {
      const aRank = a.kind === 'online' ? (rank[bookingPlatform(a)] ?? 30) : a.kind === 'homepage' ? 40 : a.kind === 'phone' ? 50 : 60;
      const bRank = b.kind === 'online' ? (rank[bookingPlatform(b)] ?? 30) : b.kind === 'homepage' ? 40 : b.kind === 'phone' ? 50 : 60;
      return aRank - bRank;
    })[0] ?? null;
}

function reservationLabel(camp) {
  const channel = primaryBooking(camp);
  return channel?.platform_name?.replace('캠핑장 자체 홈페이지', '공식 홈페이지') ?? null;
}

function conditionsFor(camp) {
  const condition = camp.field_conditions ?? {};
  const power = condition.power ?? {};
  const firewood = condition.firewood ?? {};
  const charcoal = condition.charcoal ?? {};
  const parking = condition.parking ?? {};
  const parkingLabel = {
    SITE_ADJACENT: '사이트 옆',
    EXTERNAL: '외부 주차',
    CAR_CAMP: '차박',
    SHARED_NEARBY: '공용 주차'
  }[parking.mode] ?? null;
  return {
    site: largestSite(camp),
    power: power.available && Number.isFinite(power.limit_w) && !power.statutory_standard ? power.limit_w + 'W' : null,
    fire: firewood.allowed === true ? '장작' : charcoal.allowed === true ? '숯' : null,
    parking: parkingLabel,
    source: condition.source ?? camp.booking?.source ?? null
  };
}

function badgeHtml(camp) {
  const fact = conditionsFor(camp);
  const badges = [];
  if (fact.power) badges.push('<span class="facility-badge electric">' + ICON.power + '<b>' + safe(fact.power) + '</b></span>');
  if (fact.fire) badges.push('<span class="facility-badge fire">' + ICON.fire + '<b>' + safe(fact.fire) + '</b></span>');
  if (fact.parking) badges.push('<span class="facility-badge parking">' + ICON.parking + '<b>' + safe(fact.parking) + '</b></span>');
  return badges.join('');
}

function sourceText(camp) {
  const source = conditionsFor(camp).source;
  const label = source?.label ?? '고캠핑 운영자 등록 정보';
  const checked = source?.checked_at?.slice(0, 10);
  return label + (checked ? ' · ' + checked : '');
}

function galleryHtml(camp, urls = [camp.img].filter(Boolean), index = 0) {
  const photos = urls.slice(0, MAX_PHOTOS);
  const images = photos.map((url, photoIndex) => '<img class="camp-image" src="' + safe(url) + '" alt="' + safe(camp.name) + ' ' + (photoIndex + 1) + '" loading="' + (index > 1 || photoIndex > 0 ? 'lazy' : 'eager') + '" referrerpolicy="no-referrer" draggable="false" />').join('');
  const dots = photos.length > 1 ? photos.map((_, photoIndex) => '<i class="' + (photoIndex === 0 ? 'active' : '') + '"></i>').join('') : '';
  const selectedState = selected.has(camp.id);
  return '<div class="camp-image-wrap" data-gallery data-camp-id="' + safe(camp.id) + '">' +
    '<div class="photo-track" aria-label="' + safe(camp.name) + ' 사진 ' + photos.length + '장">' + images + '</div>' +
    '<div class="photo-dots" aria-hidden="true">' + dots + '</div>' +
    '<button class="compare-toggle ' + (selectedState ? 'is-selected' : '') + '" type="button" aria-label="' + safe(camp.name) + ' 비교함에 ' + (selectedState ? '제거' : '추가') + '" data-compare="' + safe(camp.id) + '">' + (selectedState ? '✓' : '+') + '</button>' +
    '<div class="facility-badges">' + badgeHtml(camp) + '</div></div>';
}

function specHtml(camp) {
  const fact = conditionsFor(camp);
  const rows = [['사이트', fact.site ?? kindLabel(camp)], ['전기', fact.power], ['불멍', fact.fire], ['주차', fact.parking]].filter(row => row[1]);
  return rows.slice(0, 2).map(row => '<div class="spec-line"><span>' + row[0] + '</span><strong>' + safe(row[1]) + '</strong></div>').join('');
}

function cardHtml(camp, index) {
  const booking = primaryBooking(camp);
  const bookingUrl = booking?.url ?? null;
  const reservation = reservationLabel(camp);
  const action = bookingUrl
    ? '<a href="' + safe(bookingUrl) + '" target="_blank" rel="noopener noreferrer">예약 <span>↗</span></a>'
    : '<a href="../explore/#c=' + encodeURIComponent(camp.id) + '">상세 <span>↗</span></a>';
  return '<article class="camp-card" data-id="' + safe(camp.id) + '">' +
    galleryHtml(camp, [camp.img].filter(Boolean), index) +
    '<div class="camp-card-body"><div class="camp-meta"><span>' + safe(compactArea(camp)) + '</span>' + (reservation ? '<span>' + safe(reservation) + '</span>' : '') + '</div>' +
    '<a class="camp-name" href="../explore/#c=' + encodeURIComponent(camp.id) + '" title="' + safe(camp.name) + ' 상세 보기">' + safe(camp.name) + '</a>' +
    '<div class="spec-lines">' + (specHtml(camp) || '<div class="spec-line"><span>형태</span><strong>' + safe(kindLabel(camp)) + '</strong></div>') + '</div>' +
    '<div class="card-actions">' + action +
    '<button class="info-button" type="button" aria-expanded="false" aria-label="' + safe(camp.name) + ' 정보 기준"><i>i</i><span class="info-popover">' + safe(sourceText(camp)) + '</span></button></div></div></article>';
}

function matchesTheme(camp) {
  if (activeTheme === 'all') return true;
  const words = [...(camp.env ?? []), ...(camp.themes ?? []), ...(camp.amenities ?? []), ...(camp.th ?? [])].join(' ');
  if (activeTheme === 'water') return /계곡|강|호수|바다|물놀이/.test(words);
  if (activeTheme === 'forest') return /숲|산|수목|forest|mountain/.test(words);
  if (activeTheme === 'family') return /아이|놀이터|키즈|kids|체험/.test(words);
  if (activeTheme === 'glamping') return camp.kinds?.some(pair => pair[0] === 'GLAMPING' || pair[0] === 'CARAVAN_RENTAL');
  return true;
}

function filteredCamps() {
  const normalized = query.trim().toLowerCase();
  let items = catalog.filter(camp => {
    const searchable = [camp.name, camp.sido, camp.sigungu, camp.area, ...(camp.env ?? []), ...(camp.amenities ?? []), ...(camp.themes ?? [])].join(' ').toLowerCase();
    return (!normalized || searchable.includes(normalized)) && matchesTheme(camp);
  });
  if (activeFilter !== 'all') items = items.filter(camp => activeFilter === camp.area || camp.amenities?.includes(activeFilter) || camp.kinds?.some(pair => pair[0] === activeFilter));
  const sort = $('#sort-select')?.value ?? 'complete';
  return [...items].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ko');
    if (sort === 'area') return (a.area || '').localeCompare(b.area || '', 'ko');
    const score = camp => (camp.sizes?.length ?? 0) * 6 + (camp.amenities?.length ?? 0) + (camp.booking?.channels?.length ?? 0) * 3 + (camp.img ? 2 : 0);
    return score(b) - score(a);
  });
}

function renderCards() {
  const items = filteredCamps();
  const grid = $('#cards-view');
  $('#result-count').textContent = items.length.toLocaleString('ko-KR');
  $('#result-summary').textContent = items.length.toLocaleString('ko-KR') + '곳';
  grid.innerHTML = items.slice(0, visible).map(cardHtml).join('');
  $('#empty-state').hidden = items.length > 0;
  grid.hidden = items.length === 0;
  $('#more-results').hidden = items.length <= visible;
  $$('[data-compare]', grid).forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggleCompare(button.dataset.compare);
  }));
  $$('.camp-image-wrap', grid).forEach(mountGallery);
  hydrateGalleries(items.slice(0, visible));
  renderMap(items.slice(0, 36));
}

async function readDetail(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const request = fetch(detailUrl(id)).then(response => response.ok ? response.json() : null).catch(() => null);
  detailCache.set(id, request);
  return request;
}

function uniquePhotos(urls) {
  const seen = new Set();
  return urls.filter(url => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, MAX_PHOTOS);
}

async function hydrateGalleries(camps) {
  await Promise.all(camps.map(async camp => {
    const detail = await readDetail(camp.id);
    const photos = uniquePhotos([camp.img, ...(detail?.photos_remote ?? [])]);
    if (photos.length < 2) return;
    const selector = '[data-gallery][data-camp-id="' + CSS.escape(String(camp.id)) + '"]';
    const gallery = $(selector);
    if (!gallery || gallery.dataset.hydrated) return;
    gallery.dataset.hydrated = 'true';
    gallery.outerHTML = galleryHtml(camp, photos);
    const refreshed = $(selector);
    if (refreshed) {
      mountGallery(refreshed);
      const compareButton = $('[data-compare]', refreshed);
      compareButton?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        toggleCompare(compareButton.dataset.compare);
      });
    }
  }));
}

function mountGallery(gallery) {
  const track = $('.photo-track', gallery);
  const dots = $$('.photo-dots i', gallery);
  if (!track || track.dataset.mounted) return;
  track.dataset.mounted = 'true';
  let pointerId = null;
  let startX = 0;
  let startScroll = 0;
  let dragged = false;
  const updateDots = () => {
    const current = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    dots.forEach((dot, index) => dot.classList.toggle('active', index === current));
  };
  track.addEventListener('scroll', updateDots, { passive: true });
  track.addEventListener('pointerdown', event => {
    pointerId = event.pointerId;
    startX = event.clientX;
    startScroll = track.scrollLeft;
    dragged = false;
    track.setPointerCapture(pointerId);
  });
  track.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 4) dragged = true;
    track.scrollLeft = startScroll - delta;
  });
  const release = event => {
    if (event.pointerId !== pointerId) return;
    if (track.hasPointerCapture(pointerId)) track.releasePointerCapture(pointerId);
    pointerId = null;
    if (dragged) {
      const current = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      track.scrollTo({ left: current * track.clientWidth, behavior: 'smooth' });
    }
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
}

function renderMap(items) {
  const canvas = $('#map-canvas');
  $$('.map-pin', canvas).forEach(pin => pin.remove());
  items.filter(camp => Number.isFinite(camp.lat) && Number.isFinite(camp.lng)).slice(0, 18).forEach((camp, index) => {
    const fact = conditionsFor(camp);
    const x = Math.max(18, Math.min(83, 33 + (camp.lng - 126.5) * 13)) + ((index % 3) - 1) * 2.4;
    const y = Math.max(12, Math.min(86, 87 - (camp.lat - 33) * 12)) + ((Math.floor(index / 3) % 3) - 1) * 2.1;
    const button = document.createElement('button');
    button.type = 'button';
    const pinState = reservationLabel(camp) ? 'verified' : fact.site ? 'spec' : 'unknown';
    button.className = 'map-pin ' + pinState;
    button.style.left = x + '%';
    button.style.top = y + '%';
    button.setAttribute('aria-label', camp.name + ' 보기');
    button.textContent = index + 1;
    button.addEventListener('click', () => activateMapPin(camp, button));
    canvas.append(button);
  });
}

function activateMapPin(camp, node) {
  $$('.map-pin').forEach(pin => pin.classList.remove('active'));
  node.classList.add('active');
  const fact = conditionsFor(camp);
  $('#map-detail-card').innerHTML = '<span>' + safe(compactArea(camp)) + '</span><b>' + safe(camp.name) + '</b><small>' + safe(fact.site ?? kindLabel(camp)) + '</small>';
}

function toggleCompare(id) {
  if (selected.has(id)) selected.delete(id);
  else if (selected.size >= 3) {
    showToast('비교는 3곳까지 가능해요.');
    return;
  } else selected.add(id);
  $('#compare-count').textContent = selected.size;
  renderCards();
  showToast(selected.size ? selected.size + '곳 선택' : '비교를 비웠어요.');
}

function updateMetrics(availability) {
  $('#camp-count').textContent = catalog.length.toLocaleString('ko-KR');
  const online = catalog.filter(camp => camp.booking?.channels?.some(channel => channel.kind === 'online' || channel.kind === 'homepage')).length;
  const specs = catalog.filter(camp => camp.sizes?.length).length;
  const records = Array.isArray(availability?.records) ? availability.records : Array.isArray(availability?.items) ? availability.items : Array.isArray(availability) ? availability : availability?.availability ?? [];
  const fresh = availability?.expires_at ? new Date(availability.expires_at).getTime() > Date.now() : false;
  const live = fresh ? records.filter(item => (item.state ?? item.status) === 'LIVE_AVAILABLE' && item.inventory_verified).length : 0;
  const open = fresh ? records.filter(item => ['OFFICIAL_APPLICATION_OPEN', 'LIVE_AVAILABLE'].includes(item.state ?? item.status)).length : 0;
  $('#live-count').textContent = live + '곳';
  $('#official-count').textContent = online.toLocaleString('ko-KR') + '곳';
  $('#spec-count').textContent = specs.toLocaleString('ko-KR') + '곳';
  $('#open-count').textContent = open + '건';
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function setMode(mode) {
  $$('.find-mode').forEach(button => {
    const on = button.dataset.mode === mode;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', String(on));
  });
  $('#theme-row').hidden = mode !== 'theme';
  if (mode === 'map') {
    $('#map-search').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (mode === 'theme') activeTheme = 'all';
  renderCards();
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupInteractions() {
  $('#search-form').addEventListener('submit', event => {
    event.preventDefault();
    query = $('#search-query').value;
    visible = 8;
    setMode('list');
  });
  $$('.find-mode').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $$('.filter-chip').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    visible = 8;
    $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip === button));
    renderCards();
  }));
  $$('.theme-chip').forEach(button => button.addEventListener('click', () => {
    activeTheme = button.dataset.theme;
    visible = 8;
    $$('.theme-chip').forEach(chip => chip.classList.toggle('active', chip === button));
    renderCards();
  }));
  $('#sort-select').addEventListener('change', renderCards);
  $('#more-results').addEventListener('click', () => {
    visible += 8;
    renderCards();
  });
  $('#reset-filters').addEventListener('click', () => {
    query = '';
    activeFilter = 'all';
    activeTheme = 'all';
    $('#search-query').value = '';
    $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
    renderCards();
  });
  document.addEventListener('click', event => {
    const info = event.target.closest('.info-button');
    if (info) {
      const open = info.getAttribute('aria-expanded') === 'true';
      $$('.info-button[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      info.setAttribute('aria-expanded', String(!open));
      event.stopPropagation();
      return;
    }
    $$('.info-button[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    const toastButton = event.target.closest('[data-toast]');
    if (toastButton) showToast(toastButton.dataset.toast);
  });
}

async function load() {
  try {
    const responses = await Promise.all([fetch(DATA_URL), fetch('../explore/data/availability.json').catch(() => null)]);
    if (!responses[0].ok) throw new Error('catalog unavailable');
    catalog = await responses[0].json();
    updateMetrics(responses[1]?.ok ? await responses[1].json() : null);
    renderCards();
  } catch (error) {
    console.error(error);
    showToast('캠핑장 정보를 불러오지 못했습니다.');
  }
}

setupInteractions();
load();
