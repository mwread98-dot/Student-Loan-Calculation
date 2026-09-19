#!/usr/bin/env bash
#
# Build the calculator and publish it to S3 + CloudFront.
#
# Creates the infrastructure on first run and updates it after that, so the
# same command works whether or not the stack already exists.
#
# Usage:
#   ./scripts/deploy.sh
#   STACK_NAME=my-stack AWS_REGION=eu-west-2 ./scripts/deploy.sh
#   DOMAIN_NAME=loans.example.com ACM_CERTIFICATE_ARN=arn:aws:acm:us-east-1:... ./scripts/deploy.sh
#
set -euo pipefail

STACK_NAME="${STACK_NAME:-student-loan-calculator-site}"
AWS_REGION="${AWS_REGION:-eu-west-2}"
PROJECT_NAME="${PROJECT_NAME:-student-loan-calculator}"
DOMAIN_NAME="${DOMAIN_NAME:-}"
ACM_CERTIFICATE_ARN="${ACM_CERTIFICATE_ARN:-}"
SKIP_BUILD="${SKIP_BUILD:-false}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31merror: %s\033[0m\n' "$1" >&2; exit 1; }

command -v aws >/dev/null 2>&1 || fail "the AWS CLI is not installed — see https://aws.amazon.com/cli/"
aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS credentials are not working — run 'aws configure' or set AWS_PROFILE"

if [[ -n "$DOMAIN_NAME" && -z "$ACM_CERTIFICATE_ARN" ]]; then
  fail "DOMAIN_NAME needs ACM_CERTIFICATE_ARN as well (the certificate must be issued in us-east-1)"
fi

step "Deploying infrastructure to $AWS_REGION (stack: $STACK_NAME)"
aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file infra/site.yml \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "ProjectName=$PROJECT_NAME" \
    "DomainName=$DOMAIN_NAME" \
    "AcmCertificateArn=$ACM_CERTIFICATE_ARN"

stack_output() {
  aws cloudformation describe-stacks \
    --region "$AWS_REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

BUCKET="$(stack_output BucketName)"
DISTRIBUTION_ID="$(stack_output DistributionId)"
SITE_URL="$(stack_output SiteUrl)"

[[ -n "$BUCKET" && "$BUCKET" != "None" ]] || fail "could not read the bucket name from the stack outputs"

if [[ "$SKIP_BUILD" != "true" ]]; then
  step "Building"
  npm ci --no-audit --no-fund
  npm run test
  npm run build
fi

[[ -d dist ]] || fail "dist/ does not exist — run 'npm run build' first"

# Hashed assets can be cached forever; index.html must be revalidated every
# time or visitors keep loading the previous build. Assets go up first so the
# HTML never points at a file that has not landed yet.
step "Uploading assets to s3://$BUCKET"
aws s3 sync dist/ "s3://$BUCKET/" \
  --region "$AWS_REGION" \
  --delete \
  --exclude 'index.html' \
  --exclude '*.map' \
  --cache-control 'public,max-age=31536000,immutable'

step "Uploading index.html"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --region "$AWS_REGION" \
  --cache-control 'public,max-age=0,must-revalidate' \
  --content-type 'text/html; charset=utf-8'

step "Invalidating the CloudFront cache"
invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/*' \
  --query 'Invalidation.Id' \
  --output text)"

echo "Waiting for invalidation $invalidation_id to complete..."
aws cloudfront wait invalidation-completed \
  --distribution-id "$DISTRIBUTION_ID" \
  --id "$invalidation_id" || echo "(still propagating — the site is live regardless)"

step "Done"
echo "The calculator is live at: $SITE_URL"
if [[ -n "$DOMAIN_NAME" ]]; then
  echo
  echo "Point $DOMAIN_NAME at $(stack_output DistributionDomainName) with an ALIAS or CNAME record."
fi
