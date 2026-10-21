#!/usr/bin/env node
// 구조화 데이터로 1박 요금 구간(저/중/고) 분류 모델 학습. numpy 없이 순수 JS.
// 사용: node pipeline/scripts/train-fee-tier.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));

// 요금 구간: ~3만 저, 3~7만 중, 7만+ 고
function feeTier(c) {
  const f = c.fee?.min;
  if (!f || f <= 0) return null;
  if (f <= 30000) return 0;
  if (f <= 70000) return 1;
  return 2;
}

// 특성: pets가능, sizes있음, kinds수, amenities수, sido원핫(간소화)
const SIDOS = ["서울","경기","인천","강원","충북","충남","대전","세종","전북","전남","광주","경북","경남","대구","울산","부산","제주"];
function features(c) {
  const pets = /가능/.test(String(c.pets ?? "")) ? 1 : 0;
  const hasSize = c.sizes?.length ? 1 : 0;
  const kinds = Array.isArray(c.kinds) ? c.kinds.length : 0;
  const amen = Array.isArray(c.amenities) ? c.amenities.length : 0;
  const sido = SIDOS.indexOf(c.sido);
  const onehot = SIDOS.map((_, i) => (sido === i ? 1 : 0));
  return [pets, hasSize, kinds / 5, amen / 10, ...onehot];
}

const data = camps.map((c) => ({ x: features(c), y: feeTier(c) })).filter((d) => d.y !== null);
console.log(`학습 데이터: ${data.length}곳`);

// 단순 로지스틱 회귀 (다항, one-vs-rest)
function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z)))); }
function train(X, y, lr = 0.1, epochs = 200) {
  const n = X.length, d = X[0].length;
  let w = Array(d).fill(0), b = 0;
  for (let e = 0; e < epochs; e++) {
    let dw = Array(d).fill(0), db = 0;
    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((s, v, j) => s + v * w[j], b);
      const p = sigmoid(z);
      const err = p - y[i];
      for (let j = 0; j < d; j++) dw[j] += err * X[i][j];
      db += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * dw[j] / n;
    b -= lr * db / n;
  }
  return { w, b };
}

const X = data.map((d) => d.x);
const models = [0, 1, 2].map((cls) => {
  const y = data.map((d) => (d.y === cls ? 1 : 0));
  return train(X, y);
});

function predict(x) {
  const scores = models.map((m) => sigmoid(x.reduce((s, v, j) => s + v * m.w[j], m.b)));
  return scores.indexOf(Math.max(...scores));
}

let correct = 0;
for (const d of data) if (predict(d.x) === d.y) correct++;
const acc = (correct / data.length * 100).toFixed(1);
console.log(`정확도: ${acc}% (${correct}/${data.length})`);

const model = { tiers: ["~3만", "3~7만", "7만+"], features: ["pets", "hasSize", "kinds", "amen", ...SIDOS.map((s) => `sido_${s}`)], models, acc: +acc };
writeFileSync(join(root, "pipeline/out/fee-tier-model.json"), JSON.stringify(model, null, 1));
console.log("저장: pipeline/out/fee-tier-model.json");
