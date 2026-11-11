// 미리보기용 검수 대기열. 브라우저 localStorage에만 둔다. 운영 Supabase에는 쓰지 않는다.
const KEY = "mc-op-photos-queue-v1";

export function loadQueue() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveQueue(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addSubmission(row) {
  const items = loadQueue();
  items.unshift(row);
  saveQueue(items);
  return row;
}

export function updateSubmission(id, patch) {
  const items = loadQueue();
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], ...patch, updated_at: new Date().toISOString() };
  saveQueue(items);
  return items[i];
}

export function newId() {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
