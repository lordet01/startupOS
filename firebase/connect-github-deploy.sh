#!/usr/bin/env bash
# One-time setup in the owner's Google Cloud Shell. No keys or tokens are printed.
# Creates a dedicated deployment identity trusted only by this repository/main.
set -euo pipefail
project_id='startupos-6b8d4'
repo_name='lordet01/startupOS'
repo_id='1405572762'
owner_id='22748631'
pool_id='startupos-github'
provider_id='startup-os'
deploy_account="startupos-github-deploy@${project_id}.iam.gserviceaccount.com"
region='asia-east1'
for command_name in gcloud python3; do
  command -v "$command_name" >/dev/null || { printf 'Required command missing: %s\n' "$command_name"; exit 1; }
done
operator_email="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
[[ -n "$operator_email" ]] || { printf '%s\n' 'Google Cloud Shell에 로그인한 뒤 다시 실행하세요.'; exit 1; }
project_number="$(gcloud projects describe "$project_id" --format='value(projectNumber)')"
[[ "$project_number" == '1041157645946' ]] || { printf '%s\n' '프로젝트 번호가 예상과 다릅니다. 중단합니다.'; exit 1; }
runtime_account="$(gcloud functions describe startupWeb --gen2 --region="$region" --project="$project_id" --format='value(serviceConfig.serviceAccountEmail)')"
build_account="$(gcloud functions describe startupWeb --gen2 --region="$region" --project="$project_id" --format='value(buildConfig.serviceAccount)')"
[[ -n "$runtime_account" ]] || { printf '%s\n' '기존 startupWeb 런타임 계정을 확인하지 못했습니다.'; exit 1; }
if [[ -z "$build_account" ]]; then
  build_account="$(gcloud builds get-default-service-account --project="$project_id" --format='value(serviceAccountEmail)')"
fi
build_account="${build_account##*/}"
[[ -n "$build_account" ]] || { printf '%s\n' '기존 빌드 계정을 확인하지 못했습니다.'; exit 1; }
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com --project="$project_id" --quiet
if ! gcloud iam service-accounts describe "$deploy_account" --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create startupos-github-deploy --project="$project_id" --display-name='StartupOS GitHub deployment' --quiet
fi
for role_name in roles/cloudfunctions.admin roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$project_id" --member="serviceAccount:${deploy_account}" --role="$role_name" --condition=None --quiet >/dev/null
done
# Permission to use only the runtime/build identities already used by startupWeb.
for target_account in "$runtime_account" "$build_account"; do
  gcloud iam service-accounts add-iam-policy-binding "$target_account" --project="$project_id" --member="serviceAccount:${deploy_account}" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
done
# Firebase CLI also checks the legacy default service account when it exists.
legacy_account="${project_id}@appspot.gserviceaccount.com"
if gcloud iam service-accounts describe "$legacy_account" --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$legacy_account" --project="$project_id" --member="serviceAccount:${deploy_account}" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
fi
# Hosting pinTag updates revision tags on its two existing HTTP services.
for function_name in startupWeb startupApi; do
  service_resource="$(gcloud functions describe "$function_name" --gen2 --region="$region" --project="$project_id" --format='value(serviceConfig.service)')"
  [[ -n "$service_resource" ]] || { printf 'Cloud Run service not found: %s\n' "$function_name"; exit 1; }
  service_name="${service_resource##*/}"
  gcloud run services add-iam-policy-binding "$service_name" --region="$region" --project="$project_id" --member="serviceAccount:${deploy_account}" --role=roles/run.developer --condition=None --quiet >/dev/null
done
if ! gcloud iam workload-identity-pools describe "$pool_id" --location=global --project="$project_id" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool_id" --location=global --project="$project_id" --display-name='StartupOS GitHub' --quiet
fi
mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref'
condition="assertion.repository=='${repo_name}' && assertion.repository_id=='${repo_id}' && assertion.repository_owner_id=='${owner_id}' && assertion.ref=='refs/heads/main'"
if gcloud iam workload-identity-pools providers describe "$provider_id" --workload-identity-pool="$pool_id" --location=global --project="$project_id" >/dev/null 2>&1; then
  current_condition="$(gcloud iam workload-identity-pools providers describe "$provider_id" --workload-identity-pool="$pool_id" --location=global --project="$project_id" --format='value(attributeCondition)')"
  current_issuer="$(gcloud iam workload-identity-pools providers describe "$provider_id" --workload-identity-pool="$pool_id" --location=global --project="$project_id" --format='value(oidc.issuerUri)')"
  [[ "$current_condition" == "$condition" && "$current_issuer" == 'https://token.actions.githubusercontent.com' ]] || { printf '%s\n' '기존 인증 제공자 설정이 다릅니다. 기존 설정을 보존하고 중단합니다.'; exit 1; }
else
  gcloud iam workload-identity-pools providers create-oidc "$provider_id" --workload-identity-pool="$pool_id" --location=global --project="$project_id" --display-name='lordet01/startupOS main' --issuer-uri='https://token.actions.githubusercontent.com' --attribute-mapping="$mapping" --attribute-condition="$condition" --quiet
fi
pool_resource="projects/${project_number}/locations/global/workloadIdentityPools/${pool_id}"
gcloud iam service-accounts add-iam-policy-binding "$deploy_account" --project="$project_id" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/${pool_resource}/attribute.repository_id/${repo_id}" --condition=None --quiet >/dev/null
printf '\n%s\n' 'SETUP_OK'
printf 'GCP_WIF_PROVIDER=%s/providers/%s\n' "$pool_resource" "$provider_id"
printf 'GCP_DEPLOY_SERVICE_ACCOUNT=%s\n' "$deploy_account"
printf '%s\n' '위 마지막 세 줄은 비밀값이 아닙니다. 대화에 전달하면 GitHub 배포 연결을 이어갑니다.'
