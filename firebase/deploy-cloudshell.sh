#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project_id='startupos-6b8d4'
printf '%s\n' 'StartupOS → startupos-6b8d4 · Firebase 비공개 배포'
node --version
npx -y firebase-tools@latest --version
operator_email="${1:-$(gcloud config get-value account 2>/dev/null)}"
if [[ ! "$operator_email" =~ ^[^[:space:]/@]+@[^[:space:]/@]+\.[^[:space:]/@]+$ ]]; then
  printf '%s\n' '접근을 허용할 Google 로그인 이메일을 인수로 지정해 주세요.'
  exit 1
fi
printf '접근을 허용할 계정: %s\n' "$operator_email"
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  gcloud auth application-default login
fi
if ! npx -y firebase-tools@latest projects:list --json > /tmp/startupos-projects-check.json; then
  npx -y firebase-tools@latest login --no-localhost
fi
npm ci --ignore-scripts
npm test
if [[ "${STARTUPOS_TEST_RULES:-0}" == '1' ]]; then
  TEST_PRIVATE_FIREBASE=true npx -y firebase-tools@latest emulators:exec \
    --project demo-startupos --config firebase/test.emulators.json --only firestore 'node tests/firestore-rules.mjs'
fi
npm ci --ignore-scripts --prefix .firebase-build/functions
gcloud services enable iam.googleapis.com secretmanager.googleapis.com --project "$project_id" --quiet
runtime_account="startupos-runtime@${project_id}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$runtime_account" --project "$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create startupos-runtime --project "$project_id" --display-name 'StartupOS runtime'
fi
if gcloud iam roles describe startuposSession --project "$project_id" >/dev/null 2>&1; then
  gcloud iam roles update startuposSession --project "$project_id" \
    --permissions firebaseauth.users.get,firebaseauth.users.createSession,serviceusage.services.use,resourcemanager.projects.get --stage GA --quiet
else
  gcloud iam roles create startuposSession --project "$project_id" --title 'StartupOS session verification' \
    --permissions firebaseauth.users.get,firebaseauth.users.createSession,serviceusage.services.use,resourcemanager.projects.get --stage GA --quiet
fi
for role in roles/datastore.user "projects/${project_id}/roles/startuposSession"; do
  gcloud projects add-iam-policy-binding "$project_id" --member "serviceAccount:${runtime_account}" --role "$role" --condition=None --quiet >/dev/null
done
secret_version="$(gcloud secrets versions list OPENAI_API_KEY --project "$project_id" \
  --filter='state=ENABLED' --limit=1 --format='value(name)' 2>/dev/null || true)"
if [[ -z "$secret_version" ]]; then
  printf '%s\n' '기존에 사용하던 OpenAI 키를 다음 보안 입력창에 입력해 주세요. 새 키를 발급하지 않습니다.'
  npx -y firebase-tools@latest functions:secrets:set OPENAI_API_KEY --project "$project_id"
fi
gcloud secrets add-iam-policy-binding OPENAI_API_KEY --project "$project_id" \
  --member "serviceAccount:${runtime_account}" --role roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
node firebase/bootstrap.cjs "$operator_email"
npx -y firebase-tools@latest deploy --project "$project_id" --config firebase.migration.json \
  --only firestore:rules,functions,hosting
printf '\n%s\n' '배포 후 접속: https://startupos-6b8d4.web.app/'
printf '%s\n' 'Google 로그인 → 프로젝트 백업 가져오기 → 여행 앱 Build·검증·Deploy를 확인해 주세요.'
