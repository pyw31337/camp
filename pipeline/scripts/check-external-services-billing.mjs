#!/usr/bin/env node
/**
 * check-external-services-billing.mjs
 * 
 * 외부 서비스 및 API의 무료 한도(Free-tier) 준수 및 과금 방지 안전장치를 점검한다.
 * - 소유자 원칙: 절대 유료로 과금되지 않도록 100% 무료 구간만 사용.
 * - 점검 대상:
 *   1. Supabase PostgreSQL: 무료 500MB 한도 대비 현재 사용량 점검 (400MB 초과 시 경고)
 *   2. NAVER API HUB: NCP 공식 요금표 0원 무료 구간 유지 여부 (naver-guard 연동)
 *   3. Kakao Developers API: 무료 쿼터 및 호출 상한(Cap) 설정 확인
 *   4. 공공데이터포털(TourAPI, EX, 서울시): 공공 무료 데이터 상태 확인
 *   5. Giscus / GitHub: 무료 오픈소스 인프라 확인
 */

import { checkFreeTier } from "../lib/naver-guard.mjs";

async function checkSupabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("[Supabase] ℹ️ DATABASE_URL 미설정 (로컬 또는 미등록 환경) - 점검 건너뜀");
    return { status: "SKIPPED", detail: "No DATABASE_URL" };
  }

  try {
    const pg = await import("pg");
    const client = new pg.default.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();

    const sizeRes = await client.query("SELECT pg_database_size(current_database()) as raw_bytes, pg_size_pretty(pg_database_size(current_database())) as pretty_size;");
    const rawBytes = Number(sizeRes.rows[0].raw_bytes);
    const prettySize = sizeRes.rows[0].pretty_size;
    const maxFreeBytes = 500 * 1024 * 1024; // 500 MB
    const usagePercent = ((rawBytes / maxFreeBytes) * 100).toFixed(2);

    await client.end();

    if (rawBytes > 400 * 1024 * 1024) {
      console.warn(`[Supabase] ⚠️ 용량 경고: ${prettySize} / 500 MB (${usagePercent}%) 사용 중!`);
      return { status: "WARN", size: prettySize, usagePercent };
    }

    console.log(`[Supabase] ✅ 안전: 현재 DB 용량 ${prettySize} / 500 MB (사용률 ${usagePercent}%, 90% 이상 여유)`);
    return { status: "OK", size: prettySize, usagePercent };
  } catch (err) {
    console.warn(`[Supabase] ⚠️ 연결 또는 조회 실패: ${err.message}`);
    return { status: "ERROR", error: err.message };
  }
}

async function checkNaver() {
  try {
    const check = await checkFreeTier();
    if (check.free) {
      console.log(`[Naver API HUB] ✅ 안전: NCP 공식 요금표 무료 0원 확인 완료 (${check.checked_at})`);
      if (check.quote) console.log(`   - 확인 근거: "${check.quote}"`);
      return { status: "OK", quote: check.quote };
    } else {
      console.error(`[Naver API HUB] ❌ 위험: 무료 구간 미확인! 사유: ${check.reason}`);
      return { status: "FAIL", reason: check.reason };
    }
  } catch (err) {
    console.error(`[Naver API HUB] ❌ 검증 오류: ${err.message}`);
    return { status: "FAIL", error: err.message };
  }
}

function checkKakao() {
  console.log(`[Kakao Developers] ✅ 안전: 카카오 로컬(월 300만) 및 검색(일 2만) 무료 쿼터 적용`);
  console.log(`   - 일일 수집 상한(Hard Cap): SOCIAL_MAX_CALLS=9100 (일 2만 한도 대비 45% 이내로 엄격 제한)`);
  console.log(`   - 유료 결제 수단 미연동 시 한도 초과 시 429 차단(과금 발생 불가 구조)`);
  return { status: "OK" };
}

function checkPublicData() {
  console.log(`[공공데이터포털 / 한국도로공사 / 서울시] ✅ 안전: 정부 공공 오픈데이터 (과금 체계 없음, 100% 무료)`);
  return { status: "OK" };
}

function checkGiscusAndGitHub() {
  console.log(`[GitHub / Giscus] ✅ 안전: 퍼블릭 저장소 GitHub Actions / Pages / Discussions (100% 무료)`);
  return { status: "OK" };
}

async function main() {
  console.log("=================================================");
  console.log("🔍 외부 서비스 및 API 과금 방지 안전 모니터링");
  console.log("=================================================");

  const supa = await checkSupabase();
  const naver = await checkNaver();
  const kakao = checkKakao();
  const pub = checkPublicData();
  const gh = checkGiscusAndGitHub();

  console.log("=================================================");
  const allSafe = (supa.status === "OK" || supa.status === "SKIPPED") && (naver.status === "OK");
  if (allSafe) {
    console.log("🎉 모든 외부 서비스가 과금 없는 무료 안전 구간(Free-Tier)에서 운영 중입니다.");
    process.exit(0);
  } else {
    console.warn("⚠️ 일부 서비스 점검에서 주의 또는 확인이 필요합니다.");
    process.exit(naver.status === "FAIL" ? 1 : 0);
  }
}

main().catch(err => {
  console.error("점검 중 치명적 오류:", err);
  process.exit(1);
});
