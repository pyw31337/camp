#!/usr/bin/env node
/**
 * camp 서비스 로컬 데이터를 외장하드(LETS_DATA_VAULT_V1)로 우선 저장·동기화하는 스크립트.
 *
 * 공통 위치: /Volumes/My Passport for Mac/LETS_DATA_VAULT/services/camp/
 *   - data/pipeline-out/   (pipeline/out 산출물)
 *   - data/nightshift/     (~/.letscamp/{logs,maintenance,state.json,status.json,busy.json,avoid.txt})
 *   - scripts/             (이관·유지보수 스크립트 사본)
 *   - manifest.json        (camp 서비스 매니페스트)
 *
 * 사용법:
 *   node scripts/vault-sync.mjs             # 외장하드 동기화 + 매니페스트 갱신
 *   node scripts/vault-sync.mjs --status    # 현재 로컬/외장하드 저장 상태만 점검
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
export const EXTERNAL_VOLUME = process.env.LETS_EXTERNAL_VOLUME || "/Volumes/My Passport for Mac";
export const VAULT_ROOT = process.env.LETS_VAULT_ROOT || join(EXTERNAL_VOLUME, "LETS_DATA_VAULT");
export const CAMP_VAULT_ROOT = join(VAULT_ROOT, "services", "camp");
export const CAMP_VAULT_DATA = join(CAMP_VAULT_ROOT, "data");
export const CAMP_VAULT_SCRIPTS = join(CAMP_VAULT_ROOT, "scripts");
const LOCAL_LETSCAMP = join(homedir(), ".letscamp");

const STATUS_ONLY = process.argv.includes("--status");

export function isExternalVaultReady() {
  return existsSync(EXTERNAL_VOLUME) && existsSync(VAULT_ROOT);
}

/**
 * 외장하드가 연결되어 있으면 외장하드 경로를, 아니면 로컬 폴백 경로를 반환한다.
 */
export function resolveCampDataDir(...subpaths) {
  const base = isExternalVaultReady() ? CAMP_VAULT_DATA : LOCAL_LETSCAMP;
  return join(base, ...subpaths);
}

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (p) => {
    let st;
    try { st = lstatSync(p); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
      return;
    }
    files++;
    bytes += st.size;
  };
  if (existsSync(dir)) walk(dir);
  return { files, bytes, mb: Number((bytes / 1e6).toFixed(2)) };
}

function syncDir(src, dst) {
  if (!existsSync(src)) return false;
  mkdirSync(dst, { recursive: true });
  try {
    execFileSync("rsync", ["-a", "--delete", `${src}/`, `${dst}/`], { stdio: "ignore" });
  } catch {
    cpSync(src, dst, { recursive: true, force: true });
  }
  return true;
}

function copyIfExists(src, dst) {
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dst), { recursive: true });
  const st = lstatSync(src);
  if (st.isSymbolicLink()) return false;
  cpSync(src, dst, { recursive: true, force: true });
  return true;
}

function main() {
  const vaultReady = isExternalVaultReady();
  const pipelineOut = join(REPO_ROOT, "pipeline", "out");

  if (STATUS_ONLY) {
    console.log(JSON.stringify({
      external_volume_mounted: existsSync(EXTERNAL_VOLUME),
      vault_ready: vaultReady,
      camp_vault_root: CAMP_VAULT_ROOT,
      local_letscamp: dirStats(LOCAL_LETSCAMP),
      local_pipeline_out: dirStats(pipelineOut),
      vault_camp_data: vaultReady ? dirStats(CAMP_VAULT_DATA) : null,
    }, null, 2));
    return;
  }

  if (!vaultReady) {
    console.error(`외장하드 볼트(${VAULT_ROOT})가 마운트되어 있지 않습니다. 연결 후 다시 실행하세요.`);
    process.exit(1);
  }

  mkdirSync(CAMP_VAULT_DATA, { recursive: true });
  mkdirSync(CAMP_VAULT_SCRIPTS, { recursive: true });

  // 1) 원본 데이터(data/, pipeline/registry/, pipeline/out/, camping-atlas/public/explore/data/) -> services/camp/data/
  const syncedData = syncDir(join(REPO_ROOT, "data"), join(CAMP_VAULT_DATA, "raw-data"));
  const syncedRegistry = syncDir(join(REPO_ROOT, "pipeline", "registry"), join(CAMP_VAULT_DATA, "raw-registry"));
  const outDst = join(CAMP_VAULT_DATA, "pipeline-out");
  const syncedOut = syncDir(pipelineOut, outDst);
  const syncedCache = syncDir(join(REPO_ROOT, "pipeline", ".cache"), join(CAMP_VAULT_DATA, "pipeline-cache"));
  const syncedExplore = syncDir(join(REPO_ROOT, "camping-atlas", "public", "explore", "data"), join(CAMP_VAULT_DATA, "service-explore-data"));

  // 2) ~/.letscamp 상태·로그·유지보수 기록 -> services/camp/data/nightshift
  const nsDst = join(CAMP_VAULT_DATA, "nightshift");
  mkdirSync(nsDst, { recursive: true });
  for (const name of ["logs", "maintenance"]) {
    syncDir(join(LOCAL_LETSCAMP, name), join(nsDst, name));
  }
  for (const file of ["state.json", "status.json", "busy.json", "avoid.txt", "holidays.txt"]) {
    copyIfExists(join(LOCAL_LETSCAMP, file), join(nsDst, file));
  }

  // 3) 이관·유지보수 스크립트 사본 -> services/camp/scripts
  for (const rel of ["scripts/vault-sync.mjs", "scripts/local-maintenance.mjs", "local/macmini/nightshift.mjs"]) {
    copyIfExists(join(REPO_ROOT, rel), join(CAMP_VAULT_SCRIPTS, rel.split("/").pop()));
  }

  // 4) 서비스 매니페스트 작성 (LETS_DATA_VAULT_V1 공통 포맷)
  const now = new Date().toISOString();
  const dataStats = dirStats(CAMP_VAULT_DATA);
  const serviceManifest = {
    vault_schema: "LETS_DATA_VAULT_V1",
    service: "camp",
    source_machine: hostname(),
    synced_at: now,
    data_root: CAMP_VAULT_DATA,
    size_mb: dataStats.mb,
    files_count: dataStats.files,
    targets: {
      raw_data: syncedData ? dirStats(join(CAMP_VAULT_DATA, "raw-data")) : null,
      raw_registry: syncedRegistry ? dirStats(join(CAMP_VAULT_DATA, "raw-registry")) : null,
      pipeline_out: syncedOut ? dirStats(outDst) : null,
      pipeline_cache: syncedCache ? dirStats(join(CAMP_VAULT_DATA, "pipeline-cache")) : null,
      service_explore_data: syncedExplore ? dirStats(join(CAMP_VAULT_DATA, "service-explore-data")) : null,
      nightshift: dirStats(nsDst),
    },
    migration_instructions: "새 Mac에서 외장하드(/Volumes/My Passport for Mac/LETS_DATA_VAULT)를 연결하면 services/camp/data 에서 즉시 이어서 작업하거나 rsync로 복원할 수 있습니다.",
  };
  writeFileSync(join(CAMP_VAULT_ROOT, "manifest.json"), `${JSON.stringify(serviceManifest, null, 2)}\n`);

  // 5) 루트 vault_manifest.json 에 camp 서비스 등록·갱신
  const rootManifestPath = join(VAULT_ROOT, "manifests", "vault_manifest.json");
  if (existsSync(rootManifestPath)) {
    const vm = JSON.parse(readFileSync(rootManifestPath, "utf8"));
    vm.last_synced_at = now;
    vm.services ??= {};
    vm.services.camp = {
      size_mb: dataStats.mb,
      synced_at: now,
    };
    vm.total_services = Object.keys(vm.services).length;
    writeFileSync(rootManifestPath, `${JSON.stringify(vm, null, 2)}\n`);
  }

  console.log(`✅ 외장하드 동기화 완료: ${CAMP_VAULT_ROOT}`);
  console.log(`   - 용량: ${dataStats.mb} MB (${dataStats.files}개 파일)`);
  console.log(`   - 루트 매니페스트 갱신: ${rootManifestPath}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
