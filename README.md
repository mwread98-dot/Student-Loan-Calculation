# Should you overpay your student loan?

A calculator for UK **Plan 2** and **Postgraduate** student loans that answers one
question: would paying more than the minimum actually leave you better off?

For most borrowers the answer is no, and the reason is counter-intuitive. A
student loan is not really a debt — it is a graduate tax with a 30-year time
limit. Whatever is left when the 30 years are up is cancelled. If you were never
going to clear the balance anyway, every pound you overpay is a pound you would
otherwise never have handed over.

This works out which side of that line you fall on, and by how much.

Everything runs in the browser. No salary, balance or any other figure is sent
anywhere or stored.

---

## What it models

The verdict turns on rules that a generic loan calculator gets wrong:

- **The 30-year write-off.** Each loan is cancelled 30 years after the April you
  first became due to repay. This is usually the single biggest factor.
- **Income-tapered Plan 2 interest.** Plan 2 charges RPI at the repayment
  threshold, rising on a straight line to RPI + 3% at the upper threshold
  (£29,385 to £52,885 for 2026/27), then held down to the statutory cap.
- **Flat Postgraduate interest.** Postgraduate loans charge RPI + 3% at any
  income, with no taper — so they are usually the more expensive of the two.
- **Both loans stacking.** Holding both means paying 9% of everything over the
  Plan 2 threshold *and* 6% of everything over £21,000, not a blended rate.
- **Daily compounding**, as the Student Loans Company applies it.
- **The threshold freeze.** The Plan 2 threshold is frozen at £29,385 until
  April 2030, so repayments rise in real terms until then.
- **The cap expiring.** The 6% cap covers one interest year, to 31 August 2027.
  It is applied for exactly that, not for thirty years.
- **Inflation that moves.** RPI follows the OBR's published forecast to 2029,
  then settles at a long-run anchor. That anchor is deliberately low, because
  from February 2030 RPI is calculated as CPIH — roughly a percentage point
  below the old RPI. Since that covers most of a thirty-year term, it moves the
  answer more than any near-term forecast.
- **Careers that plateau.** You give pay growth *above inflation* and how many
  years it lasts; after that pay tracks inflation. Assuming real growth forever
  quietly flatters the case for overpaying.
- **Opportunity cost.** Both options are compared in present-value terms,
  discounting future payments at the **gilt yield matched to how long the debt
  has left to run** — the 30-year yield beyond fifteen years, the 10-year
  within it. Government bonds are the benchmark because the choice is between
  certain money now and certain money later. That produces a **break-even
  return**: beat it elsewhere and keeping the cash wins; fall short and
  overpaying wins.

It also shows how the answer moves across a range of salary paths, because
career trajectory drives the result more than anything else on the form.

## What it does not do

It is a projection, not a prediction, and a 30-year projection is only as good
as its assumptions. Pay rises, RPI and government policy will all differ from
any forecast. Treat it as a way of seeing which factors actually drive the
decision. It is not financial advice.

It covers England and Wales. Plan 1, Plan 4 (Scotland) and Plan 5 (courses
started from August 2023) are not modelled — see
[adding another plan](#adding-another-repayment-plan).

---

## Running it locally

Needs Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other useful commands:

```bash
npm run test         # unit tests for the projection engine
npm run typecheck    # strict TypeScript check
npm run build        # production build into dist/
npm run smoke        # end-to-end checks against a built site (see below)
```

The smoke test drives a real browser, so it needs a built site being served:

```bash
npm run build
npx vite preview --port 4173 &
npm run smoke
```

---

## Deploying to AWS

### First, put this on `main`

The repository started empty, so its first branch became the default. The
deploy workflow watches `main`, so rename it:

```bash
git branch -m claude/student-loan-payoff-calc-vtw6y9 main
git push -u origin main
```

Then set `main` as the default under **Settings → General → Default branch**
and delete the old branch. Until you do, deploys can still be triggered by hand
from the **Actions** tab.

> **Prefer clicking to typing?** [docs/DEPLOY-CONSOLE.md](docs/DEPLOY-CONSOLE.md)
> walks through the same thing entirely in the AWS console and GitHub web UI,
> with no AWS CLI and no Node installed locally.

### The hosting

The site is static, so it needs no servers: a private **S3** bucket served
through **CloudFront** over HTTPS. The bucket is never public — CloudFront
reaches it through an Origin Access Control and the bucket policy trusts
nothing else.

### One-off setup

You need the [AWS CLI](https://aws.amazon.com/cli/) installed and signed in to
the account you want to host in:

```bash
aws configure          # or: export AWS_PROFILE=your-profile
aws sts get-caller-identity   # should print your account ID
```

Then deploy:

```bash
./scripts/deploy.sh
```

That creates the infrastructure on the first run and updates it afterwards,
builds the site, uploads it, invalidates the CloudFront cache and prints the
URL. It is safe to run repeatedly.

The defaults put the stack in `eu-west-2` (London). To change anything:

```bash
AWS_REGION=eu-west-1 STACK_NAME=my-calculator ./scripts/deploy.sh
```

The first deploy takes a few minutes while CloudFront propagates. Later ones
take seconds.

### Deploying automatically on every push

`.github/workflows/deploy.yml` publishes the site whenever `main` changes. It
authenticates with **OIDC**, so there are no AWS keys stored in GitHub — the
workflow presents a short-lived token and AWS trades it for temporary
credentials scoped to this one bucket and distribution.

Create the role, replacing the repository with your own:

```bash
aws cloudformation deploy \
  --region eu-west-2 \
  --stack-name student-loan-calculator-ci \
  --template-file infra/github-oidc.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    SiteStackName=student-loan-calculator-site \
    GitHubRepository=mwread98-dot/Student-Loan-Calculation
```

> If this fails with `Provider with url ... already exists`, the account
> already has a GitHub OIDC provider — it may hold only one per issuer. Delete
> the failed stack and add `CreateOidcProvider=false` to reuse it;
> `ExistingOidcProviderArn` can stay unset, because the ARN follows from the
> issuer URL and the template derives it.

Print the role ARN:

```bash
aws cloudformation describe-stacks \
  --region eu-west-2 \
  --stack-name student-loan-calculator-ci \
  --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" \
  --output text
```

Then in GitHub, under **Settings → Secrets and variables → Actions →
Variables**, add:

| Variable | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | the ARN printed above |
| `AWS_REGION` | `eu-west-2` (optional, this is the default) |
| `SITE_STACK_NAME` | `student-loan-calculator-site` (optional, this is the default) |

These are *variables*, not secrets — a role ARN is not sensitive, and nothing
secret needs to be stored.

The workflow targets a GitHub environment called `production`. Create it under
**Settings → Environments** if you want a required approval before each
deploy; otherwise the workflow creates it implicitly on first run.

### Using your own domain

CloudFront only accepts certificates issued in **us-east-1**, whatever region
the rest of the stack is in:

```bash
aws acm request-certificate \
  --region us-east-1 \
  --domain-name loans.example.com \
  --validation-method DNS
```

Add the DNS validation record ACM asks for, wait for it to be issued, then:

```bash
DOMAIN_NAME=loans.example.com \
ACM_CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/... \
./scripts/deploy.sh
```

The script prints the CloudFront domain to point an ALIAS or CNAME record at.

### What it costs

Pennies. S3 stores a few hundred kilobytes, and CloudFront's perpetual free
tier covers 1 TB of transfer and 10 million requests a month — far more than a
personal site will use. Expect a bill under £1/month unless it goes viral.

### Tearing it down

```bash
aws cloudformation delete-stack --region eu-west-2 --stack-name student-loan-calculator-ci
aws cloudformation delete-stack --region eu-west-2 --stack-name student-loan-calculator-site
```

The bucket is deliberately set to `Retain`, so deleting the stack leaves it in
place rather than silently destroying the content. Remove it by hand once you
are sure:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=student-loan-calculator-$ACCOUNT-eu-west-2

aws s3 rm "s3://$BUCKET" --recursive     # empties it, including old versions
aws s3api delete-bucket --bucket "$BUCKET" --region eu-west-2
```

Versioning is on, so if `delete-bucket` complains the bucket is not empty,
delete the remaining object versions first — the AWS console's "Empty bucket"
button does this in one step.

---

## Keeping the figures current

**This matters more than anything else in the repository.** The thresholds
change every April and the interest rate every September. Stale numbers give
confidently wrong answers.

Every government-set figure lives in one file, [`src/domain/rates.ts`](src/domain/rates.ts),
with a source link and the date it was last checked. Nothing statutory is
hardcoded anywhere else.

Check against:

- [Repayment thresholds and rates](https://www.gov.uk/repaying-your-student-loan/what-you-pay) — every April
- [Interest rates](https://www.gov.uk/guidance/how-interest-is-calculated-plan-2) — every September
- [House of Commons Library briefing](https://commonslibrary.parliament.uk/research-briefings/cbp-10654/) — the clearest summary of both

After editing, update `RATES_LAST_CHECKED`, run `npm run test`, and push. The
unit tests assert the headline figures, so they will fail loudly if a change
is half-applied.

Also worth a look each year, though they move continuously rather than
annually:

| Input | Source | As shipped |
| --- | --- | --- |
| RPI forecast to 2029 | [OBR Economic and fiscal outlook](https://obr.uk/efo/economic-and-fiscal-outlook-march-2026/) | 3.1% in 2026, 2.9% to 2029 |
| Long-run RPI | RPI becomes CPIH in Feb 2030; CPI target plus the housing wedge | 2.2% |
| 30-year gilt yield | [UK government bond yields](https://tradingeconomics.com/united-kingdom/30-year-bond-yield) | 5.75% |
| 10-year gilt yield | [UK government bond yields](https://tradingeconomics.com/united-kingdom/government-bond-yield) | 5.20% |

Gilt yields in particular are a snapshot: both sat near multi-decade highs in
September 2026, and at those levels a risk-free return is close to what a
student loan charges, which makes overpaying roughly neutral for people who
would clear the loan anyway. Wiring `GILT_YIELD_30_YEAR` and
`GILT_YIELD_10_YEAR` to a market data feed would keep that honest without
anyone remembering to look; they are hard-coded only to keep the site free of
API keys and backend.

As shipped, the statutory figures are for **2026/27**:

| | Plan 2 | Postgraduate |
| --- | --- | --- |
| Repayment threshold | £29,385 | £21,000 |
| Repayment rate | 9% above it | 6% above it |
| Interest | RPI to RPI + 3%, by income | RPI + 3%, flat |
| Interest taper range | £29,385 – £52,885 | n/a |
| Rate cap (to 31 Aug 2027) | 6% | 6% |
| Written off | 30 years after first due | 30 years after first due |

RPI is 4.1% for 1 September 2026 to 31 August 2027; the projection moves to
the forecast path from there.

---

## How the projection works

`src/domain/engine.ts` steps forward one month at a time until every loan is
either repaid or cancelled. Within each month it:

1. Cancels any loan that has reached its 30-year anniversary.
2. Works out that year's RPI, and grows pay by inflation plus any real growth
   still running.
3. Accrues interest, compounded daily, at a rate that depends on income for
   Plan 2 and is flat for Postgraduate loans, held to the cap only while the
   cap is in force.
4. Takes the mandatory deduction for each plan separately, as PAYE does,
   rounded down to whole pounds.
5. Applies any voluntary overpayment, by default against whichever loan is
   charging the higher rate.

Because inflation drives both the interest charged and the pay that repays it,
it reaches the answer through two channels at once, and cannot be cancelled out
by a cap.

`src/domain/analysis.ts` runs that twice — once on minimum repayments, once
with the overpayment — and compares the two payment streams in present-value
terms.

Neither stream depends on the discount rate, which makes two things cheap and
exact. The remaining term can be read off the minimum-repayment projection and
used to pick the right gilt — no circularity, and an overpayment cannot move
the goalposts by shortening the term. And the break-even return is a
one-dimensional root find over the same cashflows rather than a re-simulation.

One convention to know: loan interest is a nominal rate compounded daily, while
the discount rate is an effective annual one. A 6% loan therefore shows a
break-even near 6.2%, because 6% compounded daily *is* 6.18% effective. Compare
the break-even figure against an AER, which is what savings accounts quote.

### Adding another repayment plan

Plan 1, 4 and 5 differ only in their thresholds, rates and write-off terms, all
of which are data rather than logic:

1. Add a config block to `src/domain/rates.ts` alongside `PLAN_2`.
2. Add its id to `LoanPlanId` in `src/domain/types.ts` and to the `PLANS` map in
   `src/domain/engine.ts`.
3. Add a toggle in `src/components/InputPanel.tsx`.

The engine already handles any number of loans repaying in parallel.

---

## Project layout

```
src/domain/       the calculation, with no UI in it
  rates.ts        every government-set figure, sourced and dated
  engine.ts       month-by-month projection
  analysis.ts     scenario comparison, break-even, verdict
  types.ts
src/components/   the interface
src/test/         unit tests for the engine and the comparison
infra/
  site.yml        S3 + CloudFront
  github-oidc.yml the role GitHub Actions assumes to deploy
scripts/
  deploy.sh       build and publish in one command
  smoke.mjs       end-to-end browser checks
docs/
  DEPLOY-CONSOLE.md  the same deploy, click by click
```

## Licence

MIT. See [LICENSE](LICENSE).
