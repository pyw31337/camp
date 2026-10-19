// 일출·일몰·달 위상 로컬 계산(외부 호출 없음). 태양은 SunCalc(V. Agafonkin, BSD-2)·NOAA 근사식과 같은 계열로
// 한국 위도에서 천문연구원 발표값과 보통 ±1~2분 차이다. 달은 평균 삭망월 근사(±반나절)라 ‘별 보기 좋은 날’ 판단용이다.
// 브라우저에서도 그대로 쓰도록 의존성 없는 순수 함수만 둔다(camping-atlas/public/conditions/astro.js는 이 파일의 사본).
const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397, J0 = 0.0009;
const toDays = (ms) => ms / dayMs - 0.5 + J1970 - J2000;
const fromJulian = (j) => (j + 0.5 - J1970) * dayMs;
const meanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
const eclipticLng = (M) => M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L));
const pad = (n) => String(n).padStart(2, "0");
/** epoch ms → KST "HH:MM" */
export const kstHm = (ms) => { const d = new Date(ms + 9 * 3600e3); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

/**
 * @param {string} ymd "YYYY-MM-DD"(KST 날짜)
 * @returns {{sunrise:string|null, sunset:string|null, daylight_min:number|null}} KST 시각. 백야·극야면 null
 */
export function sunTimes(ymd, lat, lng) {
  const [y, m, d0] = ymd.split("-").map(Number);
  const noonKst = Date.UTC(y, m - 1, d0, 3); // 12:00 KST
  const lw = rad * -lng, phi = rad * lat, d = toDays(noonKst);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = meanAnomaly(ds), L = eclipticLng(M), dec = declination(L);
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosW = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return { sunrise: null, sunset: null, daylight_min: null };
  const w = Math.acos(cosW);
  const Jset = J2000 + J0 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return { sunrise: kstHm(fromJulian(Jrise)), sunset: kstHm(fromJulian(Jset)), daylight_min: Math.round((Jset - Jrise) * 1440) };
}

const SYNODIC = 29.530588853;
/** 그날 밤(21시 KST) 달: age 월령(일), illum 밝기 0~1, label */
export function moonPhase(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const jd = Date.UTC(y, m - 1, d, 12) / dayMs + J1970; // 21:00 KST
  const age = (((jd - 2451550.1) % SYNODIC) + SYNODIC) % SYNODIC;
  const illum = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const label = age < 1.85 || age > 27.68 ? "그믐·삭" : age < 5.54 ? "초승달" : age < 9.23 ? "상현" : age < 12.91 ? "차가는 달" : age < 16.61 ? "보름" : age < 20.30 ? "기우는 달" : age < 23.99 ? "하현" : "그믐달";
  return { age: Math.round(age * 10) / 10, illum: Math.round(illum * 100) / 100, label, dark_sky: illum < 0.25 };
}
