#!/usr/bin/env node
/**
 * Publishes the source-controlled Vision 01 mock-up into GitHub Pages.
 * Do not hand-edit camping-atlas/public/vision; edit design/vision and re-run this script.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'design/vision');
const target = resolve(root, 'camping-atlas/public/vision');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log(`Published Vision mock-up: ${target}`);
