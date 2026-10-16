#!/usr/bin/env node
/**
 * 리뉴얼 시안(design/renewal)을 GitHub Pages 경로 /camp/renewal/로 발행한다.
 * camping-atlas/public/renewal은 생성물이다. design/renewal을 고친 뒤 이 스크립트를 다시 실행한다.
 * 사진 색인을 새로 만들려면 먼저 `node scripts/build-renewal-data.mjs`.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'design/renewal');
const target = resolve(root, 'camping-atlas/public/renewal');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log(`Published renewal mock-up: ${target}`);
