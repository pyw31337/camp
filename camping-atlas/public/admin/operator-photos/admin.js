// 운영자 사진 검수 대기열(미리보기). localStorage만 쓴다. 승인해도 실제 갤러리에는 붙이지 않는다.
import { loadQueue, updateSubmission } from "../../operator/queue.js";
import { SITE_TYPE_LABEL, REASON_LABEL, formatBizNo } from "../../operator/verify.js";

const ico = {
  cam: `<svg class="opa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 5h-2.5l-1.2-1.8A2 2 0 0 0 14.7 2H9.3a2 2 0 0 0-1.6 1.2L6.5 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm-8 13.2A4.7 4.7 0 1 1 16.7 13.5 4.7 4.7 0 0 1 12 18.2Z"/></svg>`,
  check: `<svg class="opa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.55 17.6 4.8 12.85l1.7-1.7 3.05 3.05 8-8 1.7 1.7Z"/></svg>`,
  close: `<svg class="opa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 13 11l5.3 5.3-1.4 1.4L11.6 12.4 6.3 17.7 4.9 16.3 10.2 11 4.9 5.7 6.3 4.3l5.3 5.3 5.3-5.3Z"/></svg>`,
  shield: `<svg class="opa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6.5c0 5 3.4 9.6 8 10.7 4.6-1.1 8-5.7 8-10.7V5Z"/></svg>`,
};

const METHOD = { otp: "고캠핑 전화 OTP", biz: "사업자등록번호" };
const STATUS = { PENDING: "검수 대기", APPROVED: "승인(미리보기)", REJECTED: "반려" };

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const z = new Date(d.getTime() + 9 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return `${z.getUTCFullYear()}-${p(z.getUTCMonth() + 1)}-${p(z.getUTCDate())} ${p(z.getUTCHours())}:${p(z.getUTCMinutes())} (Asia/Seoul)`;
}

function render(listEl, emptyEl) {
  const items = loadQueue();
  emptyEl.hidden = items.length > 0;
  listEl.innerHTML = items.map((row) => {
    const v = row.verify || {};
    const nameFlag = v.pending_name ? `<span class="opa-badge opa-badge--warn">상호 불일치 · 확인 필요</span>` : "";
    const st = row.status || "PENDING";
    return `<article class="opa-card" data-id="${row.id}">
      <header class="opa-card-h">
        <h2>${escapeHtml(row.camp_name || "")} <span class="opa-id">#${escapeHtml(row.campground_id || "")}</span></h2>
        <p class="opa-meta">${ico.shield} ${METHOD[v.method] || "미확인"} ${v.biz_no ? `· ${escapeHtml(formatBizNo(v.biz_no))}` : ""} ${v.biz_name ? `· 상호 ${escapeHtml(v.biz_name)}` : ""} ${nameFlag}</p>
        <p class="opa-meta">${fmtTime(row.created_at)} · <b data-st>${STATUS[st] || st}</b></p>
      </header>
      <div class="opa-photos">
        ${(row.photos || []).map((p) => {
          const ok = p.auto?.ok;
          const why = (p.auto?.reasons || []).map((r) => REASON_LABEL[r] || r).join(" · ");
          const clip = p.auto?.clip === "preview-skipped" ? "미리보기: CLIP 판정은 운영에서 이어집니다" : "site-photo-classify 대기";
          return `<figure class="opa-ph">
            <img src="${p.preview}" alt="" width="${p.width || 400}" height="${p.height || 260}">
            <figcaption>
              <span class="opa-badge ${ok ? "opa-badge--ok" : "opa-badge--no"}">${ok ? "자동 판정 통과" : "자동 판정 보류"}</span>
              ${escapeHtml(SITE_TYPE_LABEL[p.type] || p.type)} · ${clip}
              ${why ? `<br>${escapeHtml(why)}` : ""}
            </figcaption>
          </figure>`;
        }).join("")}
      </div>
      <div class="opa-actions" ${st === "PENDING" ? "" : "hidden"}>
        <label class="opa-note-lab">검토 메모
          <textarea data-note rows="2" maxlength="400" placeholder="반려 사유나 확인할 점"></textarea>
        </label>
        <div class="opa-btns">
          <button type="button" class="opa-btn" data-act="APPROVED">${ico.check} 승인</button>
          <button type="button" class="opa-btn opa-btn--ghost" data-act="REJECTED">${ico.close} 반려</button>
        </div>
      </div>
      <p class="opa-done" data-done ${st === "PENDING" ? "hidden" : ""}>${st === "APPROVED" ? "승인했습니다. 이 미리보기에서는 실제 상세 갤러리에 붙이지 않습니다." : `반려했습니다${row.review_note ? ` — ${escapeHtml(row.review_note)}` : ""}`}</p>
    </article>`;
  }).join("");

  listEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-id]");
      const id = card.getAttribute("data-id");
      const note = card.querySelector("[data-note]")?.value?.trim() || "";
      const status = btn.getAttribute("data-act");
      updateSubmission(id, { status, review_note: note, reviewed_at: new Date().toISOString() });
      render(listEl, emptyEl);
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function start() {
  const list = document.querySelector("[data-list]");
  const empty = document.querySelector("[data-empty]");
  render(list, empty);
  document.querySelector("[data-refresh]")?.addEventListener("click", () => render(list, empty));
}
