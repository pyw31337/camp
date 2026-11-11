// 운영자 사이트(상품) 사진 올리기 UI. 미리보기에서는 mock OTP·localStorage 대기열.
import {
  SITE_TYPE_OPTIONS, SITE_TYPE_LABEL, gocampingTel, maskTel, validBizNo, formatBizNo,
  decideBizOwnership, mockNtsStatus, preflightPhoto, otpCode, REASON_LABEL, TEST_BIZ, isPreviewHost, campSiteTypes,
} from "./verify.js";
import { addSubmission, newId } from "./queue.js";

const ico = {
  cam: `<svg class="opp-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 5h-2.5l-1.2-1.8A2 2 0 0 0 14.7 2H9.3a2 2 0 0 0-1.6 1.2L6.5 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm-8 13.2A4.7 4.7 0 1 1 16.7 13.5 4.7 4.7 0 0 1 12 18.2Z"/></svg>`,
  phone: `<svg class="opp-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1.2 1.2 0 0 1 1.2-.3 12 12 0 0 0 3.8.6 1.2 1.2 0 0 1 1.2 1.2V20a1.2 1.2 0 0 1-1.2 1.2A17.2 17.2 0 0 1 2.8 4.2 1.2 1.2 0 0 1 4 3h3.3A1.2 1.2 0 0 1 8.5 4.2a12 12 0 0 0 .6 3.8 1.2 1.2 0 0 1-.3 1.2Z"/></svg>`,
  biz: `<svg class="opp-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 21V7.5A1.5 1.5 0 0 1 4.5 6H9V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6h4.5A1.5 1.5 0 0 1 21 7.5V21h-6v-4.5h-6V21ZM10.5 6h3V4.5h-3Z"/></svg>`,
  shield: `<svg class="opp-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6.5c0 5 3.4 9.6 8 10.7 4.6-1.1 8-5.7 8-10.7V5Z"/></svg>`,
  check: `<svg class="opp-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.55 17.6 4.8 12.85l1.7-1.7 3.05 3.05 8-8 1.7 1.7Z"/></svg>`,
};

const STYLE = `
.opp{margin-top:18px;min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:keep-all}
.opp-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 8px}
.opp-head h3{margin:0;font:700 1.05rem/1.35 var(--sans,inherit);color:var(--ink,#1b241c)}
.opp-lead{margin:0 0 14px;color:var(--muted,#5c6b5e);font:400 .92rem/1.5 var(--sans,inherit)}
.opp-ico{width:1.15em;height:1.15em;flex:none;display:inline-block;vertical-align:-.15em}
.opp-step{border:1px solid color-mix(in srgb, var(--line,#c9d4c6) 80%, transparent);border-radius:14px;padding:14px 14px 16px;margin:0 0 12px;background:color-mix(in srgb, var(--card,#fff) 88%, #eef3ea);min-width:0}
.opp-step h4{margin:0 0 8px;font:700 .95rem/1.4 var(--sans,inherit);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.opp-phone{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.opp-mask{font:700 1.05rem/1.3 var(--sans,inherit);letter-spacing:.02em;padding:8px 12px;border-radius:10px;background:#e8f0e4;color:#1b241c;max-width:100%;overflow-wrap:anywhere}
.opp-lock{font:400 .82rem/1.45 var(--sans,inherit);color:var(--muted,#5c6b5e);flex:1 1 12rem;min-width:0}
.opp-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 0}
.opp-row input[type=text],.opp-row input[type=tel]{flex:1 1 10rem;min-width:0;max-width:100%;padding:9px 11px;border-radius:10px;border:1px solid #c9d4c6;font:400 .95rem/1.3 var(--sans,inherit)}
.opp-btn{appearance:none;border:0;border-radius:999px;padding:9px 14px;font:700 .88rem/1.2 var(--sans,inherit);background:#2f5d32;color:#fff;cursor:pointer;display:inline-flex;gap:6px;align-items:center;flex:none}
.opp-btn[disabled]{opacity:.45;cursor:not-allowed}
.opp-btn--ghost{background:#e8f0e4;color:#1b241c}
.opp-note,.opp-err,.opp-ok{margin:8px 0 0;font:400 .85rem/1.45 var(--sans,inherit);overflow-wrap:anywhere}
.opp-err{color:#8a2b1d}
.opp-ok{color:#1e5a28}
.opp-preview-banner{margin:8px 0 0;padding:10px 12px;border-radius:10px;background:#fff6d8;color:#5a4a10;font:400 .85rem/1.45 var(--sans,inherit);overflow-wrap:anywhere}
.opp-preview-banner strong{font-variant-numeric:tabular-nums;letter-spacing:.12em}
.opp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}
.opp-chip{appearance:none;border:1px solid #c9d4c6;background:#fff;border-radius:999px;padding:6px 10px;font:600 .8rem/1.2 var(--sans,inherit);cursor:pointer;color:#1b241c;max-width:100%;overflow-wrap:anywhere}
.opp-chip[aria-pressed=true]{background:#2f5d32;border-color:#2f5d32;color:#fff}
.opp-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:8px 0}
@media (max-width:360px){.opp-thumbs{grid-template-columns:1fr}}
.opp-thumb{min-width:0;border-radius:12px;overflow:hidden;border:1px solid #d5ddd2;background:#fff}
.opp-thumb img{display:block;width:100%;height:120px;object-fit:cover}
.opp-thumb figcaption{padding:8px;font:400 .78rem/1.4 var(--sans,inherit);overflow-wrap:anywhere}
.opp-badge{display:inline-block;border-radius:999px;padding:2px 8px;font:700 .7rem/1.3 var(--sans,inherit)}
.opp-badge--ok{background:#e3f5e5;color:#1e5a28}
.opp-badge--no{background:#fde8e4;color:#8a2b1d}
.opp-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.opp-done{padding:12px;border-radius:12px;background:#e3f5e5;color:#1e5a28;font:400 .92rem/1.5 var(--sans,inherit);overflow-wrap:anywhere}
`;

function ensureStyle() {
  if (document.getElementById("opp-style")) return;
  const s = document.createElement("style");
  s.id = "opp-style";
  s.textContent = STYLE;
  document.head.appendChild(s);
}

async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("read"));
      i.src = url;
    });
    const width = img.naturalWidth, height = img.naturalHeight;
    const canvas = document.createElement("canvas");
    const max = 1280;
    const s = Math.min(1, max / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * s));
    canvas.height = Math.max(1, Math.round(height * s));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    return { width, height, preview, size: file.size, name: file.name, type: file.type };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mountPhotos(el, camp, { preview = isPreviewHost() } = {}) {
  if (!el || !camp) return;
  ensureStyle();
  const tel = gocampingTel(camp);
  const masked = tel ? maskTel(tel) : "";
  const types = campSiteTypes(camp);
  const typeOpts = [
    ...SITE_TYPE_OPTIONS.filter(([c]) => types.includes(c)),
    ...SITE_TYPE_OPTIONS.filter(([c]) => !types.includes(c)),
  ];
  const state = { verified: false, method: "", pending_name: false, bizNo: "", bizName: "", sent: "", photos: [], type: types[0] || "AUTO" };

  el.innerHTML = `
    <div class="opp">
      <div class="opp-head">${ico.cam}<h3>사이트(상품) 사진 올리기</h3></div>
      <p class="opp-lead">이 캠핑장의 사이트 유형별 사진을 운영자가 직접 올릴 수 있어요. 사진은 바로 공개되지 않고, 자동 판정 뒤 관리자가 확인한 다음에만 올라갑니다.</p>
      <section class="opp-step" data-step="verify">
        <h4>${ico.shield} 이 캠핑장의 운영자인지 확인</h4>
        ${tel ? `
          <div class="opp-phone">
            <span class="opp-mask" data-mask>${masked}</span>
            <span class="opp-lock">${ico.phone} 고캠핑에 등록된 전화번호로만 인증번호를 보냅니다. 다른 번호는 넣을 수 없어요.</span>
          </div>
          <div class="opp-row">
            <button type="button" class="opp-btn" data-send>${ico.phone} 인증번호 받기</button>
          </div>
          <div class="opp-row" data-otp-row hidden>
            <label class="opp-hidden" for="opp-otp-${camp.id}">인증번호</label>
            <input id="opp-otp-${camp.id}" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="인증번호 6자리" data-otp>
            <button type="button" class="opp-btn" data-check-otp>확인</button>
          </div>
          <p class="opp-preview-banner" data-mock hidden></p>
          <p class="opp-err" data-otp-err hidden></p>
        ` : `
          <p class="opp-note">고캠핑에 등록된 전화번호가 없어 문자 인증을 쓸 수 없어요. 사업자등록번호로 확인해 주세요.${camp.tel_src ? " (지금 보이는 연락처는 카카오·네이버에서 채운 번호라 인증에 쓰지 않습니다.)" : ""}</p>
        `}
        <details class="opp-biz" ${tel ? "" : "open"}>
          <summary>${tel ? "전화를 받을 수 없나요? 사업자등록번호로 확인" : "사업자등록번호로 확인"}</summary>
          <p class="opp-note">국세청 사업자 상태조회에서 계속사업자인지 확인하고, 상호는 시설명과 맞춰 봅니다. 미리보기에서는 실제 국세청을 호출하지 않아요.</p>
          <div class="opp-row">
            <label class="opp-hidden" for="opp-biz-${camp.id}">사업자등록번호</label>
            <input id="opp-biz-${camp.id}" type="text" inputmode="numeric" maxlength="12" placeholder="000-00-00000" data-biz autocomplete="off">
            <label class="opp-hidden" for="opp-bnm-${camp.id}">상호</label>
            <input id="opp-bnm-${camp.id}" type="text" placeholder="사업자등록증 상호" data-bnm autocomplete="organization">
            <button type="button" class="opp-btn opp-btn--ghost" data-check-biz>${ico.biz} 확인</button>
          </div>
          <p class="opp-note">미리보기 시험 번호: 계속 ${TEST_BIZ.ok}, 폐업 ${TEST_BIZ.closed}, 휴업 ${TEST_BIZ.suspended}</p>
          <p class="opp-err" data-biz-err hidden></p>
        </details>
        <p class="opp-ok" data-verified hidden></p>
      </section>
      <section class="opp-step" data-step="up" hidden>
        <h4>${ico.cam} 사이트 유형을 고르고 사진을 올리세요</h4>
        <div class="opp-chips" data-chips>
          ${typeOpts.map(([c, lab]) => `<button type="button" class="opp-chip" data-type="${c}" aria-pressed="${c === state.type ? "true" : "false"}">${lab}</button>`).join("")}
        </div>
        <div class="opp-row">
          <input class="opp-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-file>
          <button type="button" class="opp-btn" data-pick>${ico.cam} 사진 고르기</button>
        </div>
        <div class="opp-thumbs" data-thumbs></div>
        <button type="button" class="opp-btn" data-submit disabled>검수 대기열에 넣기</button>
        <p class="opp-err" data-up-err hidden></p>
      </section>
      <p class="opp-done" data-done hidden></p>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const show = (node, on, text) => {
    if (!node) return;
    node.hidden = !on;
    if (text != null) node.textContent = text;
  };
  const markVerified = (msg) => {
    state.verified = true;
    show($("[data-verified]"), true, msg);
    $("[data-step=up]").hidden = false;
  };

  $("[data-send]")?.addEventListener("click", () => {
    state.sent = otpCode();
    $("[data-otp-row]").hidden = false;
    const banner = $("[data-mock]");
    if (preview) {
      show(banner, true, "");
      banner.innerHTML = `미리보기에서는 문자를 보내지 않습니다. 테스트 인증번호는 <strong>${state.sent}</strong> 입니다. 운영에서는 등록된 전화로만 갑니다.`;
    } else {
      show(banner, true, "운영에서는 등록된 전화로 인증번호가 갑니다. 이 미리보기 분기가 아니면 발송 서버가 필요합니다.");
    }
    show($("[data-otp-err]"), false);
  });

  $("[data-check-otp]")?.addEventListener("click", () => {
    const code = ($("[data-otp]")?.value || "").replace(/\D/g, "");
    if (!state.sent) return show($("[data-otp-err]"), true, "먼저 인증번호를 받아 주세요.");
    if (code !== state.sent) return show($("[data-otp-err]"), true, "인증번호가 맞지 않아요.");
    show($("[data-otp-err]"), false);
    state.method = "otp";
    state.pending_name = false;
    markVerified("고캠핑 등록 전화 인증을 확인했습니다. 이제 사진을 올릴 수 있어요.");
  });

  $("[data-check-biz]")?.addEventListener("click", () => {
    const no = $("[data-biz]")?.value || "";
    const bnm = ($("[data-bnm]")?.value || "").trim();
    const err = $("[data-biz-err]");
    if (!validBizNo(no)) return show(err, true, "사업자등록번호 10자리를 확인해 주세요.");
    const decided = decideBizOwnership({ campName: camp.name, bizName: bnm, ntsItem: mockNtsStatus(no) });
    if (!decided.verified) return show(err, true, REASON_LABEL[decided.reason] || "확인할 수 없는 번호예요.");
    show(err, false);
    state.method = "biz";
    state.pending_name = decided.pending_name;
    state.bizNo = formatBizNo(no);
    state.bizName = bnm;
    const nameNote = decided.pending_name
      ? " 상호가 시설명과 잘 맞지 않아, 관리자가 한 번 더 확인합니다."
      : " 상호가 시설명과 맞아요.";
    markVerified(`국세청 계속사업자로 확인했습니다(미리보기).${bnm ? nameNote : " 상호를 적어 주시면 시설명과 맞춰 봅니다."}`);
  });

  el.querySelectorAll("[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.type = btn.getAttribute("data-type");
      el.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
    });
  });

  const renderThumbs = () => {
    const box = $("[data-thumbs]");
    box.innerHTML = state.photos.map((p, i) => `
      <figure class="opp-thumb">
        <img src="${p.preview}" alt="" width="${p.width}" height="${p.height}">
        <figcaption>
          <span class="opp-badge ${p.auto.ok ? "opp-badge--ok" : "opp-badge--no"}">${p.auto.ok ? "자동 판정 통과" : "자동 판정 보류"}</span>
          ${SITE_TYPE_LABEL[p.type] || p.type}<br>
          ${p.auto.ok ? "관리자 확인 후 공개" : (p.auto.reasons || []).map((r) => REASON_LABEL[r] || r).join(" · ")}
          <button type="button" class="opp-btn opp-btn--ghost" data-del="${i}">빼기</button>
        </figcaption>
      </figure>`).join("");
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      state.photos.splice(Number(b.getAttribute("data-del")), 1);
      renderThumbs();
      syncSubmit();
    }));
    syncSubmit();
  };

  const syncSubmit = () => {
    const ok = state.verified && state.photos.some((p) => p.auto.ok);
    $("[data-submit]").disabled = !ok;
  };

  $("[data-pick]").addEventListener("click", () => $("[data-file]").click());
  $("[data-file]").addEventListener("change", async (ev) => {
    const err = $("[data-up-err]");
    show(err, false);
    const files = [...(ev.target.files || [])].slice(0, 8);
    ev.target.value = "";
    for (const file of files) {
      if (state.photos.length >= 8) break;
      try {
        const img = await readImage(file);
        const auto = preflightPhoto(img);
        auto.clip = preview ? "preview-skipped" : "queued";
        state.photos.push({ ...img, type: state.type, auto });
      } catch {
        show(err, true, "사진을 읽지 못했어요. 다른 파일로 시도해 주세요.");
      }
    }
    renderThumbs();
  });

  $("[data-submit]").addEventListener("click", () => {
    if (!state.verified) return;
    const keep = state.photos.filter((p) => p.auto.ok);
    if (!keep.length) return show($("[data-up-err]"), true, "자동 판정을 통과한 사진이 없어요.");
    const row = {
      id: newId(),
      status: "PENDING",
      campground_id: String(camp.id),
      camp_name: camp.name,
      verify: { method: state.method, pending_name: state.pending_name, biz_no: state.method === "biz" ? state.bizNo : "", biz_name: state.bizName },
      photos: keep.map((p) => ({ type: p.type, preview: p.preview, width: p.width, height: p.height, name: p.name, auto: p.auto })),
      created_at: new Date().toISOString(),
      preview: true,
    };
    addSubmission(row);
    $("[data-step=up]").hidden = true;
    show($("[data-done]"), true, `검수 대기열에 넣었습니다(${keep.length}장). 미리보기 관리자 페이지에서 승인하면 공개할 수 있어요. 이 미리보기에서는 실제 상세 갤러리에 바로 붙이지 않습니다.`);
    const admin = document.createElement("p");
    admin.className = "opp-note";
    const href = new URL("../../../admin/operator-photos/", import.meta.url);
    // will fix href in standalone vs app
    admin.innerHTML = `<a href="${adminHref()}">검수 대기열 열기</a>`;
    $("[data-done]").after(admin);
  });
}

function adminHref() {
  const p = location.pathname;
  if (p.includes("/admin/operator-photos")) return "./";
  if (p.includes("/operator/")) return p.replace(/\/operator\/.*$/, "/admin/operator-photos/");
  if (p.includes("/camp/")) return p.replace(/\/camp\/.*$/, "/admin/operator-photos/");
  return p.replace(/\/[^/]*$/, "/") + "admin/operator-photos/";
}
