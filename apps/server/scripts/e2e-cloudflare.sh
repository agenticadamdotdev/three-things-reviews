#!/usr/bin/env bash
# End-to-end check of the Cloudflare port against local D1: starts wrangler dev, exercises the flow, stops it.
set -u
cd "$(dirname "$0")/.."
B=http://localhost:8788; O="Origin: $B"; J="Content-Type: application/json"
rm -rf .wrangler/state && bunx wrangler d1 migrations apply three-things-reviews --local >/dev/null 2>&1
bunx wrangler dev --port 8788 --local --test-scheduled >/tmp/rk-dev.log 2>&1 & DEV=$!
trap 'kill $DEV 2>/dev/null; pkill -f "wrangler dev --port 8788" 2>/dev/null' EXIT
for i in $(seq 60); do curl -s $B/api/v1/public/forms/x >/dev/null 2>&1 && break; sleep 1; done
pass=0; fail=0; check(){ if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (got $2, want $3)"; fail=$((fail+1)); fi; }
py(){ python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
st(){ curl -s -o /tmp/rk-body -w '%{http_code}' "$@"; }
check "admin dashboard served" "$(st $B/)" 200
check "SPA route served" "$(st $B/forms)" 200
check "first sign-up (owner)" "$(st -X POST $B/api/auth/sign-up/email -H "$J" -H "$O" -d '{"email":"owner@test.local","password":"correct-horse-battery","name":"Owner"}')" 200
check "second sign-up refused" "$(st -X POST $B/api/auth/sign-up/email -H "$J" -H "$O" -d '{"email":"intruder@test.local","password":"correct-horse-battery","name":"X"}')" 403
check "wrong password refused" "$(st -X POST $B/api/auth/sign-in/email -H "$J" -H "$O" -d '{"email":"owner@test.local","password":"nope-nope-nope"}')" 401
TOKEN=$(curl -s -D - -o /dev/null -X POST $B/api/auth/sign-in/email -H "$J" -H "$O" -d '{"email":"owner@test.local","password":"correct-horse-battery"}' | awk -F': ' 'tolower($1)=="set-auth-token"{print $2}' | tr -d '\r')
check "sign-in returns token" "$([ -n "$TOKEN" ] && echo yes)" yes
A="Authorization: Bearer $TOKEN"
check "me (session works)" "$(st $B/api/v1/me -H "$A")" 200
check "create form" "$(st -X POST $B/api/v1/forms -H "$A" -H "$J" -d '{"name":"Three Things planner","slug":"three-things"}')" 201
FORM_ID=$(py "d.get('publicId') or d.get('data',{}).get('publicId') or d.get('form',{}).get('publicId','')" < /tmp/rk-body)
check "form has public id" "$([ -n "$FORM_ID" ] && echo yes)" yes
check "get API keys" "$(st $B/api/v1/api-keys -H "$A")" 200
PK=$(py "d['publicKey']" < /tmp/rk-body)
REVIEW='{"formId":"'$FORM_ID'","content":"Finally a planner I did not abandon.","authorName":"Sam","rating":5,"authorTitle":"Verified buyer","metadata":{"paymentId":"pay_test"}}'
check "submit without secret refused" "$(st -X POST $B/api/v1/public/reviews -H "$J" -d "$REVIEW")" 403
check "submit with wrong secret refused" "$(st -X POST $B/api/v1/public/reviews -H "$J" -H 'x-submit-secret: wrong' -d "$REVIEW")" 403
check "submit with secret accepted" "$(st -X POST $B/api/v1/public/reviews -H "$J" -H 'x-submit-secret: local-submit-secret' -d "$REVIEW")" 201
RID=$(py "d['id']" < /tmp/rk-body)
check "pending review not public" "$(curl -s "$B/api/v1/public/reviews?formId=$FORM_ID" -H "x-api-key: $PK" | py "len(d['data'])")" 0
check "approve review" "$(st -X PATCH $B/api/v1/testimonials/$RID/status -H "$A" -H "$J" -d '{"status":"approved"}')" 200
check "approved review public" "$(curl -s "$B/api/v1/public/reviews?formId=$FORM_ID" -H "x-api-key: $PK" | py "d['data'][0]['rating']")" 5
check "public feed needs key" "$(st "$B/api/v1/public/reviews?formId=$FORM_ID")" 401
check "dashboard stats (30/60-day growth)" "$(st $B/api/v1/dashboard/stats -H "$A")" 200
FID=$(curl -s $B/api/v1/forms -H "$A" | py "(d if isinstance(d, list) else d.get('data'))[0]['id']")
check "form stats (14-day chart)" "$(st $B/api/v1/forms/$FID/stats -H "$A")" 200
REORDER='{"positions":[{"id":"'$RID'","position":1}]}'
check "reorder (case update)" "$(st -X POST $B/api/v1/testimonials/reorder -H "$A" -H "$J" -d "$REORDER")" 200
sleep 2
check "new-review email handed to Email Sending" "$(grep -c 'New 5★ review from Sam' /tmp/rk-dev.log | tr -d ' ' | awk '{print ($1>0)?"yes":"no"}')" yes
check "weekly report cron runs" "$(st "$B/cdn-cgi/handler/scheduled?cron=0+13+*+*+1")" 200
sleep 2
check "weekly report email handed to Email Sending" "$(grep -c 'Weekly reviews:' /tmp/rk-dev.log | tr -d ' ' | awk '{print ($1>0)?"yes":"no"}')" yes
echo "passed $pass, failed $fail"
[ $fail -eq 0 ] || { echo '--- dev log tail'; tail -30 /tmp/rk-dev.log; }
