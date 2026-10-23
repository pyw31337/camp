# 코덱스에게 줄 프롬프트 — 소유자 할 일 한 번에 처리

맥미니(또는 아무 맥)에서 코덱스를 열고 `---` 아래 내용을 그대로 붙여 넣는다.
도중에 코덱스가 **Supabase 액세스 토큰** 하나만 물어본다. 만드는 법은 맨 아래 "토큰 만들기"에 있다(1분).

---

너는 이 맥에서 일하는 에이전트다. 주인(박영우)은 개발자가 아니다. 끝까지 알아서 처리하고, 결과는 쉬운 한국어로 보고해 줘.
클라우드 에이전트(Claude)가 못 하는 일, 즉 **운영 DB에 SQL 적용**과 **이 맥의 정리·야간 작업 점검**을 맡긴다.

## 지켜야 할 것
- 비밀값(토큰·키·.env)은 화면에만 쓰고 **절대 git에 올리지 않는다.** 파일로 저장해야 하면 `~/.letscamp/secrets.env`(권한 600)에만 둔다.
- 데이터를 지우는 SQL은 아래 목록에 있는 파일만 실행한다. 직접 DELETE/DROP을 새로 쓰지 않는다.
- 어느 단계가 실패하면 멈추지 말고 원인을 적은 뒤 다음 단계로 간다. 마지막에 한꺼번에 보고한다.

## 1. 저장소 최신으로
```bash
cd ~/.letscamp/camp 2>/dev/null || { git clone https://github.com/pyw31337/camp.git ~/.letscamp/camp && cd ~/.letscamp/camp; }
git fetch origin main && git checkout -q main && git pull -q --ff-only origin main
```

## 2. 운영 DB(Supabase)에 SQL 적용
- 프로젝트: `zgnetdxqzsnmzdvoxzbw`.
- 주인에게 "Supabase 액세스 토큰(sbp_로 시작)을 붙여 넣어 주세요"라고 묻는다.
- 받은 토큰은 이 터미널 세션의 환경 변수로만 쓴다.

```bash
read -rs SUPABASE_ACCESS_TOKEN && export SUPABASE_ACCESS_TOKEN   # 주인이 붙여 넣음(화면에 안 보임)
run_sql() {  # 파일 하나를 Management API로 실행
  node -e 'process.stdout.write(JSON.stringify({query:require("fs").readFileSync(process.argv[1],"utf8")}))' "$1" \
  | curl -sS -X POST "https://api.supabase.com/v1/projects/zgnetdxqzsnmzdvoxzbw/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @- ; echo
}
```

다음 순서로 하나씩 실행한다. 모두 여러 번 실행해도 안전하게 만들어져 있다.

| 순서 | 파일 | 하는 일 |
|---|---|---|
| 1 | `db/018_safe_save_log_feed.sql` | 로그 화면용 안전한 조회 함수 추가, 공개 키로 IP·브라우저 원문 직접 읽기 차단 |
| 2 | `db/019_view_log.sql` | 상세 진입 기록 표 |
| 3 | `db/020_reconcile_shared_saves.sql` | 빠진 공용 찜 복구(지우지 않고 보충만) |
| 4 | `db/021_list_detail_entry_log.sql` | 목록→상세 진입만 집계 |
| 5 | `db/022_delete_agent_save_log_rows.sql` | 에이전트(헤드리스 브라우저)가 남긴 찜 기록 141건 삭제. 사본은 `pipeline/registry/archive/`에 있음 |
| 6 | `db/023_log_auth.sql` | 로그 화면 비밀번호(처음 0602, 화면에서 바꾸기) |

```bash
for f in 018_safe_save_log_feed 019_view_log 020_reconcile_shared_saves 021_list_detail_entry_log 022_delete_agent_save_log_rows 023_log_auth; do
  echo "== $f"; run_sql "db/$f.sql"
done
```

- 응답이 `[]`이거나 행 목록이면 성공이다.
- `{"message": ...}`이면 실패다. 내용을 기록한다.
- 이미 있는 객체 때문에 실패했다면 그 파일은 건너뛰어도 된다.

**확인**(공개 키로, 토큰 없이):
```bash
URL=https://zgnetdxqzsnmzdvoxzbw.supabase.co
KEY=$(curl -s https://pyw31337.github.io/camp/ | grep -o 'name="supabase-anon-key" content="[^"]*"' | sed 's/.*content="//;s/"$//')
curl -s -X POST "$URL/rest/v1/rpc/log_auth_check" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"pw":"0602"}'; echo   # true 여야 함
curl -s -X POST "$URL/rest/v1/rpc/safe_save_log_feed" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"row_limit":3}'; echo   # 기록 3건(ip 없음)
curl -s "$URL/rest/v1/save_log?select=ip&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"; echo   # 권한 오류여야 함(=IP 공개 차단됨)
curl -s "$URL/rest/v1/log_auth?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"; echo   # 권한 오류 또는 [] 여야 함(비밀번호 해시 비공개)
```

마지막으로 `unset SUPABASE_ACCESS_TOKEN`을 하고, 주인에게 "Supabase → Account → Access Tokens에서 방금 토큰을 지우셔도 됩니다"라고 알려 준다.

## 3. 로그 화면 확인
- 브라우저로 https://pyw31337.github.io/camp/log/ 를 연다(배포 반영까지 몇 분 걸릴 수 있음).
- 비밀번호 `0602`로 들어가지는지 본다.
- 오른쪽 위 열쇠 버튼(비밀번호 바꾸기) 창에 "서버 설정 필요" 안내가 **안 나오는지** 본다. 안 나오면 023이 적용된 것이다.
- 비밀번호는 주인이 직접 바꾸게 둔다. 코덱스가 바꾸지 않는다.

## 4. 이 맥 정리·백업
같은 폴더의 `local/macmini/CODEX_CLEANUP_PROMPT.md` 내용을 그대로 수행한다(사본 찾기 → 백업 → 정리 → 전후 보고).

## 5. 맥미니 야간 작업 점검
```bash
launchctl list | grep -i letscamp
tail -n 80 ~/.letscamp/logs/$(date +%Y-%m-%d).log 2>/dev/null
node ~/.letscamp/camp/local/macmini/nightshift.mjs --dry-run 2>/dev/null | tail -n 30
```
- 새 작업 `saved-first`(찜한 업장 먼저 수집)가 목록에 보이는지 확인한다.
- 실패가 반복되는 작업은 로그의 마지막 오류를 보고한다.
- 야간 작업이 설치돼 있지 않으면 `local/macmini/CODEX_PROMPT.md`대로 설치한다.

## 6. 보고(쉬운 한국어, 표 하나)
| 항목 | 결과 | 메모 |
|---|---|---|
| SQL 018~023 | 성공/실패 | 실패한 파일과 메시지 |
| 비밀번호 확인 | true/false | |
| IP 공개 차단 | 됨/안 됨 | |
| 맥 정리 | 전·후 파일 수, 용량 | |
| 백업 브랜치 | 이름 | |
| 야간 작업 | 정상/문제 | saved-first 포함 여부 |

보고 끝에 "남은 할 일"이 있으면 한 줄씩 적는다.

---

## 토큰 만들기(주인이 1분 동안 할 일)
1. https://supabase.com/dashboard/account/tokens 를 연다(로그인 상태).
2. **Generate new token**을 누른다. 이름은 `codex-once`로 한다.
3. 나온 `sbp_…` 값을 복사해 코덱스가 물을 때 붙여 넣는다.
4. 다 끝나면 같은 화면에서 그 토큰을 **Revoke**(삭제)한다.
