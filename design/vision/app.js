const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DATA_URL = '../explore/data/campgrounds.json';
const FEATURED_IDS = ['101374', '101362', '100851', '2022', '101040', '2765', '101285', '6765', '2778'];
const DEMO_FACTS = {
  '101374': { power: '600W 초과 제한', powerTrust: 'official', fire: '장작·숯 / 지정 화로대', parking: '주차 확인 필요', note: '운영자 등록 소개문에 기재된 이용 규칙입니다. 방문 전 예약 채널에서 다시 확인하세요.' },
  '101362': { power: '전기 제공 / W 확인 필요', powerTrust: 'unknown', fire: '장작 판매', parking: '오토 14면', note: '전기 제공·사이트 규격은 공식 등록 정보입니다. 전력 허용량과 사이트 옆 주차 여부는 확인이 필요합니다.' },
  '100851': { power: '600W / 후기 언급', powerTrust: 'unknown', fire: '장작 판매', parking: '오토 20면', note: '600W는 후기 언급이므로 확정 정보가 아닙니다. 공식 예약 화면에서 재확인해야 합니다.' },
  '2022': { power: '전기 사용 가능', powerTrust: 'official', fire: '개별 화로', parking: '오토 69면', note: '전기 사용·오토캠핑 면수는 공식 관광 정보에 기재되어 있습니다. 허용 전력은 확인이 필요합니다.' },
  '101040': { power: '전기 제공', powerTrust: 'official', fire: '장작 판매', parking: '글램핑 30동', note: '글램핑 형태와 편의시설은 공식 등록 정보입니다. 개별 상품의 가격·잔여는 예약 화면에서만 확인됩니다.' },
  '2765': { power: '전기 / W 확인 필요', powerTrust: 'unknown', fire: '개별 화로', parking: '오토 60면', note: '국립공원 예약 채널과 사이트 면수는 등록 정보 기준입니다. 전력과 불멍 세부 규칙은 출발 전 확인하세요.' },
  '101285': { power: '600W / 후기 언급', powerTrust: 'unknown', fire: '개별 화로', parking: '사이트 옆 / 후기', note: '전력·주차 위치는 후기 언급을 포함하므로 ‘확인 필요’로 보입니다.' },
  '6765': { power: '600W / 후기 언급', powerTrust: 'unknown', fire: '불멍 규칙 확인', parking: '오토 15면', note: '후기 속 정보는 실제 운영 규칙의 근거가 아닙니다. 공식 예약 화면 재확인이 필요합니다.' },
  '2778': { power: '600W / 후기 언급', powerTrust: 'unknown', fire: '장작 판매', parking: '주차 확인 필요', note: '사이트 형태·면수는 공식 등록 정보이며, 전력은 후기 언급이라 확인이 필요합니다.' }
};

let catalog = [];
let visible = 6;
let activeFilter = 'all';
let activeMode = 'list';
let query = '';
let selected = new Set();

function safe(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]);
}

function compactArea(camp) {
  return camp.sigungu ? `${camp.sido} · ${camp.sigungu}`.replace('특별자치도', '').replace('광역시', '') : camp.area;
}

function kindLabel(camp) {
  const kinds = camp.kinds ?? [];
  const labels = { AUTO_PITCH: '오토', PITCH: '일반', GLAMPING: '글램핑', CARAVAN_RENTAL: '카라반', RV_PITCH: '캠핑카' };
  return kinds.map(([kind, count]) => `${labels[kind] ?? kind} ${count}면`).slice(0, 2).join(' · ') || '형태 확인 필요';
}

function largestSite(camp) {
  const sizes = camp.sizes ?? [];
  if (!sizes.length) return null;
  const [w, h, count] = [...sizes].sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];
  return `${w}×${h}m${count ? ` · ${count}면` : ''}`;
}

function reservationLabel(camp) {
  const channel = camp.booking?.channels?.find(item => item.kind === 'online' || item.kind === 'homepage') ?? camp.booking?.channels?.[0];
  return channel?.platform_name?.replace('캠핑장 자체 홈페이지', '공식 홈페이지') ?? '예약 경로 확인 필요';
}

function badgeHtml(camp, fact) {
  const badges = [];
  if (fact.power.includes('600W')) badges.push(`<span class="facility-badge electric"><b>⚡</b>${safe(fact.power.replace(' / 후기 언급', ''))}</span>`);
  else if (camp.amenities?.includes('전기')) badges.push(`<span class="facility-badge electric"><b>⚡</b>전기 ${fact.power.includes('확인 필요') ? 'W 확인 필요' : '제공'}</span>`);
  if (fact.fire.includes('장작')) badges.push(`<span class="facility-badge fire"><b>🔥</b>${safe(fact.fire.split(' / ')[0])}</span>`);
  if (fact.parking.includes('오토')) badges.push(`<span class="facility-badge parking"><b>▣</b>${safe(fact.parking)}</span>`);
  if (fact.parking.includes('확인') || fact.power.includes('후기')) badges.push(`<span class="facility-badge needs">확인 필요</span>`);
  return badges.slice(0, 3).join('');
}

function cardHtml(camp, index) {
  const fact = DEMO_FACTS[camp.id] ?? { power: camp.amenities?.includes('전기') ? '전기 제공 / W 확인 필요' : '전기 확인 필요', powerTrust: 'unknown', fire: camp.amenities?.includes('장작판매') ? '장작 판매' : '불멍 확인 필요', parking: kindLabel(camp), note: '공식 등록 정보와 보조 데이터를 나누어 표시합니다.' };
  const site = largestSite(camp);
  const bookingUrl = camp.booking?.url || camp.homepage || camp.gc_url;
  const image = camp.img || `https://images.unsplash.com/photo-1504851149312-7a075b496cc7?auto=format&fit=crop&w=1000&q=80`;
  const source = camp.booking?.source;
  const isSelected = selected.has(camp.id);
  return `<article class="camp-card" data-id="${safe(camp.id)}">
    <div class="camp-image-wrap">
      <img class="camp-image" src="${safe(image)}" alt="${safe(camp.name)} 공식 등록 사진" loading="${index > 2 ? 'lazy' : 'eager'}" referrerpolicy="no-referrer" />
      <span class="camp-overline">OFFICIAL PHOTO · ${safe(camp.area || '전국')}</span>
      <button class="compare-toggle ${isSelected ? 'is-selected' : ''}" type="button" aria-label="${safe(camp.name)} 비교함에 ${isSelected ? '제거' : '추가'}" data-compare="${safe(camp.id)}">${isSelected ? '✓' : '+'}</button>
      <div class="facility-badges">${badgeHtml(camp, fact)}</div>
    </div>
    <div class="camp-card-body">
      <div class="camp-meta"><span>${safe(compactArea(camp))}</span><span class="status-chip">${safe(reservationLabel(camp))}</span></div>
      <a class="camp-name" href="../explore/#c=${encodeURIComponent(camp.id)}" title="${safe(camp.name)} 상세 보기">${safe(camp.name)}</a>
      <div class="spec-lines">
        <div class="spec-line"><span>사이트</span><strong>${safe(site || kindLabel(camp))}</strong><i class="confidence ${site ? 'official' : 'unknown'}"></i></div>
        <div class="spec-line"><span>전기</span><strong>${safe(fact.power)}</strong><i class="confidence ${safe(fact.powerTrust)}"></i></div>
        <div class="spec-line"><span>불멍·주차</span><strong>${safe(`${fact.fire} · ${fact.parking}`)}</strong><i class="confidence ${fact.parking.includes('확인') ? 'unknown' : 'official'}"></i></div>
      </div>
      <div class="card-actions"><a href="${safe(bookingUrl || camp.gc_url || '#')}" target="_blank" rel="noopener noreferrer">공식 예약 채널 <span>↗</span></a><button class="info-button" type="button" aria-expanded="false" aria-label="${safe(camp.name)} 정보 신뢰도"><i>i</i><span class="info-popover">${safe(fact.note)}<br /><br />기준: ${safe(source?.label || '공식 등록 정보')} · ${safe(source?.checked_at?.slice(0, 10) || '확인일 표기 필요')}</span></button></div>
    </div>
  </article>`;
}

function filteredCamps() {
  const normalized = query.trim().toLowerCase();
  let items = catalog.filter(camp => FEATURED_IDS.includes(camp.id));
  if (normalized) items = catalog.filter(camp => [camp.name, camp.sido, camp.sigungu, camp.area, ...(camp.env ?? []), ...(camp.amenities ?? [])].join(' ').toLowerCase().includes(normalized));
  if (activeFilter !== 'all') {
    items = items.filter(camp => activeFilter === camp.area || camp.amenities?.includes(activeFilter) || camp.kinds?.some(([kind]) => kind === activeFilter));
  }
  const sort = $('#sort-select')?.value ?? 'complete';
  return [...items].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ko');
    if (sort === 'area') return (a.area || '').localeCompare(b.area || '', 'ko');
    const score = camp => (camp.sizes?.length ?? 0) * 6 + (camp.amenities?.length ?? 0) + (camp.booking?.channels?.length ?? 0) * 3;
    return score(b) - score(a);
  });
}

function renderCards() {
  const items = filteredCamps();
  const grid = $('#cards-view');
  const empty = $('#empty-state');
  const more = $('#more-results');
  $('#result-count').textContent = query || activeFilter !== 'all' ? items.length.toLocaleString('ko-KR') : catalog.length.toLocaleString('ko-KR');
  grid.innerHTML = items.slice(0, visible).map(cardHtml).join('');
  $$('[data-compare]', grid).forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    toggleCompare(button.dataset.compare);
  }));
  empty.hidden = items.length > 0;
  grid.hidden = items.length === 0;
  more.hidden = items.length <= visible;
  renderMap(items.slice(0, 24));
}

function renderMap(items) {
  const canvas = $('#map-canvas');
  $$('.map-pin', canvas).forEach(pin => pin.remove());
  if (!items.length) return;
  const valid = items.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const fallback = items.filter(c => !valid.includes(c));
  const pinItems = valid.concat(fallback).slice(0, 15);
  pinItems.forEach((camp, index) => {
    const fact = DEMO_FACTS[camp.id] ?? {};
    const spreadX = ((index % 3) - 1) * 2.8;
    const spreadY = ((Math.floor(index / 3) % 3) - 1) * 2.3;
    const x = (Number.isFinite(camp.lng) ? Math.max(18, Math.min(83, 33 + (camp.lng - 126.5) * 13)) : 35 + (index * 11) % 45) + spreadX;
    const y = (Number.isFinite(camp.lat) ? Math.max(12, Math.min(86, 87 - (camp.lat - 33) * 12)) : 25 + (index * 13) % 48) + spreadY;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `map-pin ${fact.powerTrust === 'unknown' ? 'unknown' : ''}`;
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;
    button.dataset.id = camp.id;
    button.setAttribute('aria-label', `${camp.name} 지도에서 보기`);
    button.textContent = index + 1;
    button.addEventListener('click', () => activateMapPin(camp, button));
    canvas.append(button);
  });
}

function activateMapPin(camp, node) {
  $$('.map-pin').forEach(pin => pin.classList.remove('active'));
  node.classList.add('active');
  const fact = DEMO_FACTS[camp.id] ?? {};
  $('#map-detail-card').innerHTML = `<span>${safe(compactArea(camp))} · ${safe(reservationLabel(camp))}</span><b>${safe(camp.name)}</b><small>${safe(largestSite(camp) || kindLabel(camp))} · ${safe(fact.power || '전기 확인 필요')} · ${safe(fact.fire || '불멍 확인 필요')}</small>`;
}

function toggleCompare(id) {
  if (selected.has(id)) selected.delete(id);
  else if (selected.size >= 3) { showToast('비교는 최대 3곳까지 담을 수 있어요.'); return; }
  else selected.add(id);
  $('#compare-count').textContent = selected.size;
  renderCards();
  showToast(selected.size ? `${selected.size}곳을 비교함에 담았어요.` : '비교함을 비웠어요.');
}

function updateMetrics(availability) {
  $('#camp-count').textContent = catalog.length.toLocaleString('ko-KR');
  const online = catalog.filter(c => c.booking?.channels?.some(channel => channel.kind === 'online' || channel.kind === 'homepage')).length;
  const specs = catalog.filter(c => c.sizes?.length).length;
  const availableItems = Array.isArray(availability?.records) ? availability.records : Array.isArray(availability?.items) ? availability.items : Array.isArray(availability) ? availability : availability?.availability ?? [];
  const fresh = availability?.expires_at ? new Date(availability.expires_at).getTime() > Date.now() : false;
  const validLive = fresh ? availableItems.filter(item => (item.state ?? item.status) === 'LIVE_AVAILABLE' && item.inventory_verified).length : 0;
  const open = fresh ? availableItems.filter(item => ['OFFICIAL_APPLICATION_OPEN', 'LIVE_AVAILABLE'].includes(item.state ?? item.status)).length : 0;
  $('#live-count').textContent = `${validLive}곳`;
  $('#official-count').textContent = `${online.toLocaleString('ko-KR')}곳`;
  $('#spec-count').textContent = `${specs.toLocaleString('ko-KR')}곳`;
  $('#open-count').textContent = `${open}건`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2900);
}

function setupInteractions() {
  $('#search-form').addEventListener('submit', event => {
    event.preventDefault();
    query = $('#search-query').value;
    visible = 6;
    renderCards();
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(query ? `‘${query}’ 조건으로 탐색 결과를 정리했어요.` : '전국 캠핑장을 정보가 풍부한 순으로 정리했어요.');
  });
  $$('.filter-chip').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    visible = 6;
    $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip === button));
    renderCards();
  }));
  $$('.mode-tab').forEach(button => button.addEventListener('click', () => {
    activeMode = button.dataset.mode;
    $$('.mode-tab').forEach(tab => { const on = tab === button; tab.classList.toggle('active', on); tab.setAttribute('aria-selected', String(on)); });
    if (activeMode === 'map') $('#map-search').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (activeMode === 'theme') { activeFilter = '전기'; $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === '전기')); renderCards(); showToast('테마 시안: 전기 사용 가능한 캠핑장부터 보고 있어요.'); }
  }));
  $('#sort-select').addEventListener('change', renderCards);
  $('#more-results').addEventListener('click', () => { visible += 6; renderCards(); });
  $('#reset-filters').addEventListener('click', () => { query = ''; activeFilter = 'all'; $('#search-query').value = ''; $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all')); renderCards(); });
  document.addEventListener('click', event => {
    const info = event.target.closest('.info-button');
    if (info) {
      const wasOpen = info.getAttribute('aria-expanded') === 'true';
      $$('.info-button[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      info.setAttribute('aria-expanded', String(!wasOpen));
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
    const [catalogResponse, availabilityResponse] = await Promise.all([
      fetch(DATA_URL),
      fetch('../explore/data/availability.json').catch(() => null)
    ]);
    if (!catalogResponse.ok) throw new Error('catalog unavailable');
    catalog = await catalogResponse.json();
    let availability = null;
    if (availabilityResponse?.ok) availability = await availabilityResponse.json();
    updateMetrics(availability);
    renderCards();
  } catch (error) {
    console.error(error);
    showToast('실제 카탈로그를 불러오지 못했습니다. 네트워크 연결을 확인하세요.');
  }
}

setupInteractions();
load();
