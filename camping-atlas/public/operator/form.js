// 상세 화면 ‘운영자 정보 바로잡기’ — GitHub 계정 없이 Supabase(public.operator_submission)에 넣기만 한다.
// 공개 키는 INSERT만 가능(db/015). 소유자가 검토·승인한 값만 사이트에 ‘운영자 직접 등록’으로 반영된다.
import { FORM_FIELDS, normalizeFields } from "./rules.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LAST = "mc-opform-last";

function inputFor(code, f) {
  const n = `f_${code}`;
  if (f.type === "enum") return `<select name="${n}"><option value="">그대로 두기</option>${Object.entries(f.values).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>`;
  if (f.type === "time") return `<input name="${n}" type="time" step="600">`;
  if (f.type === "krw") return `<input name="${n}" type="number" inputmode="numeric" min="1000" max="2000000" step="1000" placeholder="예: 45000">`;
  if (f.type === "url") return `<input name="${n}" type="url" placeholder="https://">`;
  if ((f.max ?? 0) > 120) return `<textarea name="${n}" rows="2" maxlength="${f.max}"></textarea>`;
  return `<input name="${n}" maxlength="${f.max ?? 120}">`;
}

export function formHtml(camp) {
  return `<details class="opf"><summary>캠핑장 운영자이신가요? 정보 바로잡기</summary>
<form data-opform novalidate>
<p class="muted">로그인 없이 보낼 수 있어요. 검토 뒤 승인된 값만 ‘운영자 직접 등록’으로 표시되고, 연락처는 공개되지 않아요.</p>
<input type="hidden" name="cid" value="${esc(camp.id)}"><input type="hidden" name="cname" value="${esc(camp.name)}">
<label class="opf-hp" aria-hidden="true">비워 두세요<input name="website" tabindex="-1" autocomplete="off"></label>
<div class="opf-grid">
<label>관계<select name="role" required><option value="OWNER">대표</option><option value="STAFF">직원</option><option value="AGENCY">위탁 운영</option></select></label>
<label>이름(공개 안 함)<input name="name" maxlength="40" required></label>
<label>확인용 연락처(공개 안 함)<input name="contact" maxlength="120" placeholder="전화 또는 이메일" required></label>
${Object.entries(FORM_FIELDS).map(([code, f]) => `<label>${esc(f.label)}${inputFor(code, f)}</label>`).join("")}
<label>근거 주소(공식 홈페이지·공지, 선택)<input name="evidence" type="url" maxlength="500" placeholder="https://"></label>
</div>
<label class="opf-ok"><input type="checkbox" name="consent" required> 이 캠핑장 운영 관계자이며, 입력한 정보 게시와 확인 연락에 동의해요.</label>
<button class="btn primary" type="submit">보내기</button> <span class="muted" data-opform-msg role="status"></span>
</form></details>`;
}
const STYLE = `.opf{margin-top:8px}.opf summary{cursor:pointer;font-weight:600}.opf form{display:grid;gap:10px;margin-top:10px}
.opf-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.opf label{display:grid;gap:4px;font-size:13px}
.opf input,.opf select,.opf textarea{font:inherit;padding:8px;border:1px solid var(--line,#dde);border-radius:8px;background:var(--bg,#fff);color:inherit}
.opf .opf-ok{display:flex;gap:6px;align-items:flex-start}.opf .opf-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}`;

/** 폼 값 → 넣을 행. 문제가 있으면 {error} */
export function rowFrom(fd) {
  if (fd.get("website")) return { error: "보내지 못했어요." };
  if (!fd.get("consent")) return { error: "동의에 체크해 주세요." };
  const name = String(fd.get("name") ?? "").trim(), contact = String(fd.get("contact") ?? "").trim();
  if (!name || contact.length < 5) return { error: "이름과 확인용 연락처를 적어 주세요." };
  const raw = Object.fromEntries(Object.keys(FORM_FIELDS).map((c) => [c, fd.get(`f_${c}`)]));
  const fields = normalizeFields(raw);
  if (!Object.keys(fields).length) return { error: "바로잡을 항목을 하나 이상 적어 주세요." };
  const ev = String(fd.get("evidence") ?? "").trim();
  return { row: { kind: "UPDATE", campground_id: String(fd.get("cid")), campground_name: String(fd.get("cname")).slice(0, 100), submitter_name: name.slice(0, 40), submitter_role: String(fd.get("role")), contact: contact.slice(0, 120), fields, evidence_url: /^https?:\/\//.test(ev) ? ev.slice(0, 500) : null, consent: true } };
}

export function mount(el, camp, sb) {
  if (!el || !camp || !sb?.url || !sb?.key) return;
  if (!document.getElementById("opf-style")) { const s = document.createElement("style"); s.id = "opf-style"; s.textContent = STYLE; document.head.append(s); }
  el.innerHTML = formHtml(camp);
  el.hidden = false;
  const form = el.querySelector("[data-opform]"), msg = el.querySelector("[data-opform-msg]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const last = Number(localStorage.getItem(LAST) || 0);
    if (Date.now() - last < 10 * 60e3) { msg.textContent = "방금 보냈어요. 10분 뒤에 다시 보낼 수 있어요."; return; }
    const { row, error } = rowFrom(new FormData(form));
    if (error) { msg.textContent = error; return; }
    const btn = form.querySelector("button"); btn.disabled = true; msg.textContent = "보내는 중…";
    try {
      const r = await fetch(`${sb.url}/rest/v1/operator_submission`, { method: "POST", headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(row) });
      if (r.ok) { localStorage.setItem(LAST, String(Date.now())); form.reset(); msg.textContent = "받았어요. 검토 뒤 반영돼요. 고맙습니다!"; }
      else msg.textContent = r.status === 404 ? "아직 접수 창구가 준비 중이에요. 잠시 뒤 다시 시도해 주세요." : "지금은 보내지 못했어요.";
    } catch { msg.textContent = "지금은 보내지 못했어요."; }
    btn.disabled = false;
  });
}
