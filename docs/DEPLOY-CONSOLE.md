# Deploying from the AWS console

A click-through alternative to [`scripts/deploy.sh`](../scripts/deploy.sh). You
need neither the AWS CLI nor Node installed: CloudFormation builds the
infrastructure from the templates in [`infra/`](../infra), and GitHub Actions
builds and uploads the site.

Total time is about 20 minutes, most of it waiting for CloudFront.

You will need an AWS account with permission to create S3 buckets, CloudFront
distributions and IAM roles, and admin access to the GitHub repository.

---

## Step 1 — Rename the branch to `main`

Do this first: it makes every later URL stable and is what lets you trigger the
deploy by hand.

1. Go to **Settings → General** in the GitHub repository.
2. Scroll to **Default branch**, click the **pencil / rename** icon next to
   `claude/student-loan-payoff-calc-vtw6y9`.
3. Rename it to `main` and confirm.

That renames the branch and keeps it as the default in one go.

---

## Step 2 — Download the two templates

In GitHub, open each file and use the **download raw file** button (the
downward arrow, top right of the file view):

- [`infra/site.yml`](../infra/site.yml) — the hosting
- [`infra/github-oidc.yml`](../infra/github-oidc.yml) — the deploy role

Save both somewhere you can find them. You will upload them in the next steps.

---

## Step 3 — Create the hosting stack

> **Set your region first.** Use the region picker in the top right and choose
> **Europe (London) eu-west-2** before you start. The bucket is created in
> whichever region is selected, and it is annoying to move later. CloudFront
> itself is global, so it does not matter which region you pick for that.

1. Open the **CloudFormation** console and click **Create stack → With new
   resources (standard)**.
2. Under *Specify template*, choose **Upload a template file**, click **Choose
   file**, and pick `site.yml`. Click **Next**.
3. **Stack name:** `student-loan-calculator-site`

   Leave the parameters as they are:

   | Parameter | Value |
   | --- | --- |
   | `ProjectName` | `student-loan-calculator` |
   | `DomainName` | *(leave blank)* |
   | `AcmCertificateArn` | *(leave blank)* |
   | `PriceClass` | `PriceClass_100` |

   `PriceClass_100` serves from North America and Europe and is the cheapest.
   Custom domains are covered in [step 7](#step-7--optional-use-your-own-domain).

4. Click **Next**, then **Next** again — nothing on the options page needs
   changing.
5. On the review page, click **Submit**.

The stack takes **5–15 minutes**, nearly all of it creating the CloudFront
distribution. `CREATE_IN_PROGRESS` for ten minutes is normal, not a failure.
Watch the **Events** tab if you want to see what it is doing.

When the status reaches **CREATE_COMPLETE**, open the **Outputs** tab. You will
need these:

| Output | What it is |
| --- | --- |
| `SiteUrl` | where the calculator will be served |
| `BucketName` | the bucket the site uploads to |
| `DistributionId` | the distribution to invalidate after a deploy |

Visiting `SiteUrl` now returns an error — the bucket is empty until step 6.

---

## Step 4 — Create the deploy role

This lets GitHub Actions publish to that bucket without you storing any AWS
keys. GitHub presents a short-lived OIDC token, AWS exchanges it for temporary
credentials, and the role it grants can reach nothing but this one bucket and
distribution.

1. **CloudFormation → Create stack → With new resources (standard)** again.
2. Upload `github-oidc.yml`. Click **Next**.
3. **Stack name:** `student-loan-calculator-ci`

   | Parameter | Value |
   | --- | --- |
   | `SiteStackName` | `student-loan-calculator-site` |
   | `GitHubRepository` | `mwread98-dot/Student-Loan-Calculation` |
   | `GitHubRefPattern` | `ref:refs/heads/main` |
   | `CreateOidcProvider` | `true` |
   | `ExistingOidcProviderArn` | *(leave blank)* |

   `SiteStackName` must match step 3 exactly — this stack reads that one's
   outputs to scope the permissions.

   `GitHubRepository` is **owner/repo and nothing else**. Not the address bar
   contents, so no `https://`, no `github.com/`, no `.git`, no quotes and no
   stray space on either end. Type it by hand if a paste misbehaves — it is
   shorter than checking. That exact string is compared against the identity
   GitHub puts in its token, so a `.git` on the end passes validation here and
   then silently fails to authenticate in step 6.

4. Click **Next**, then **Next**.
5. Near the bottom of the review page, tick:

   > **I acknowledge that AWS CloudFormation might create IAM resources with
   > custom names.**

   The stack fails immediately without this. It is the step people miss.

6. Click **Submit**. This one takes under a minute.

Open the **Outputs** tab and copy **`DeployRoleArn`**. It looks like
`arn:aws:iam::123456789012:role/student-loan-calculator-site-github-deploy`.

<details>
<summary>If the stack fails with "Provider ... already exists"</summary>

```
Provider with url https://token.actions.githubusercontent.com already exists.
(Service: Iam, Status Code: 409)
```

An AWS account may hold only one OIDC provider per issuer, and yours already
has one for GitHub — from an earlier project, or created for you. Nothing is
wrong; the stack just needs to reuse it instead.

1. **Delete the rolled-back stack.** Select it and click **Delete**. A stack in
   `ROLLBACK_COMPLETE` cannot be retried in place, and the name stays taken
   until it is gone.
2. **Create it again**, changing one parameter:
   - `CreateOidcProvider` = **`false`**
   - `ExistingOidcProviderArn` = leave blank

   The ARN of a GitHub provider is fully determined by the issuer URL, so the
   template works it out. There is nothing to look up.

While you are there, it is worth checking the provider you are about to reuse
accepts the right audience. Open **IAM → Identity providers →
`token.actions.githubusercontent.com`** and confirm `sts.amazonaws.com` is
listed under **Audiences**. If it is not, add it — otherwise the deploy in
step 6 fails to authenticate even though the role looks correct.

</details>

---

## Step 5 — Tell GitHub which role to use

1. In the GitHub repository, go to **Settings → Secrets and variables →
   Actions**.
2. Select the **Variables** tab — not *Secrets*.
3. Click **New repository variable**:
   - **Name:** `AWS_DEPLOY_ROLE_ARN`
   - **Value:** the **`DeployRoleArn`** from step 4

   Take it from the stack's **Outputs** tab, not from anywhere else on this
   page. It contains **`:role/`** and ends in `-github-deploy`:

   ```
   arn:aws:iam::123456789012:role/student-loan-calculator-site-github-deploy
   ```

   If what you have contains `:oidc-provider/`, that is the identity provider,
   which cannot be assumed — the deploy fails with the rather unhelpful
   `Could not assume role with OIDC: Request ARN is invalid`. The workflow now
   checks this before doing anything else and tells you which one you have.

A role ARN is not sensitive, which is the point of using OIDC — there is no
access key to leak. If your stack is not in `eu-west-2`, add a second variable
`AWS_REGION` with your region.

---

## Step 6 — Deploy

1. Open the **Actions** tab.
2. Choose **Deploy** in the left sidebar.
3. Click **Run workflow → Run workflow**.

The run typechecks, runs the tests, builds the site, signs in to AWS, uploads
to S3 and invalidates the CloudFront cache. It takes two or three minutes, and
the summary at the end links to the live site.

From now on every push to `main` deploys automatically.

Open `SiteUrl` from step 3. If you still get an error page, give CloudFront a
minute and hard-refresh — an empty-bucket error may have been cached briefly.

---

## Step 7 — Optional: use your own domain

> **The certificate must be in US East (N. Virginia) `us-east-1`.** CloudFront
> accepts certificates from that region only, no matter where the rest of your
> stack lives. A certificate issued in London will not appear as an option and
> the reason why is not obvious.

1. Switch the region picker to **US East (N. Virginia)**.
2. Open **AWS Certificate Manager → Request → Request a public certificate**.
3. Enter your domain, e.g. `loans.example.com`, and choose **DNS validation**.
4. Open the certificate and click **Create records in Route 53**, or copy the
   CNAME it shows and add it at your DNS provider by hand.
5. Wait for the status to become **Issued** — usually a few minutes.
6. Copy the certificate ARN.

Now update the hosting stack:

1. Switch the region picker back to **Europe (London)**.
2. **CloudFormation → `student-loan-calculator-site` → Update**.
3. Choose **Use current template**, click **Next**.
4. Fill in:
   - `DomainName` = `loans.example.com`
   - `AcmCertificateArn` = the ARN from step 6
5. **Next**, **Next**, **Submit**. Updating the distribution takes a few
   minutes.

When it finishes, the **Outputs** tab shows `DnsTarget` — something like
`d111111abcdef8.cloudfront.net`. Point your domain at it:

- **Route 53:** an **A record**, *Alias* switched on, aliased to the CloudFront
  distribution.
- **Anywhere else:** a **CNAME** from `loans.example.com` to that value.

---

## Diagnosing a rejected login

`Not authorized to perform sts:AssumeRoleWithWebIdentity` means AWS compared
the token against the role's trust policy and refused, without saying what it
compared. The deploy workflow prints the identity being presented just before
it tries, under **Show the identity GitHub will present**:

```
subject  (sub): repo:owner@1234/repo@5678:ref:refs/heads/main
audience (aud): sts.amazonaws.com
```

Two things must line up with it:

1. **IAM → Roles → the deploy role → Trust relationships.** The `sub` condition
   must allow that exact string. The template allows two patterns, one per
   subject format; if yours shows only a single `repo:owner/name:...` string,
   the stack is running an older template and needs updating.
2. **IAM → Identity providers → `token.actions.githubusercontent.com` →
   Audiences.** Must list `sts.amazonaws.com`. This is worth checking whenever
   you have reused a provider created by something else.

## A note on subject claims

AWS decides whether to trust a run by comparing the *subject claim* in
GitHub's token against the role's trust policy. Two things change what GitHub
puts in that claim, and both cause the same opaque
`Not authorized to perform sts:AssumeRoleWithWebIdentity`:

- **Repositories created from 15 July 2026 onwards** use an immutable subject
  that embeds permanent numeric IDs —
  `repo:owner@1234/repo@5678:ref:refs/heads/main` rather than
  `repo:owner/repo:ref:refs/heads/main`. Older repositories keep the original
  format unless they opt in, and a rename or transfer moves them across too.
  The template accepts both, so this is handled either way.

- **A job that declares an `environment:`** gets
  `repo:...:environment:<name>` in place of the branch part entirely. The
  deploy workflow therefore does not use one. If you want an environment — to
  require an approval before each deploy — add it to the job *and* set the
  stack's `GitHubRefPattern` to `environment:<name>`. Changing one without the
  other breaks authentication.

## What this costs

Pennies. The site is a few hundred kilobytes in S3, and CloudFront's perpetual
free tier covers 1 TB of transfer and 10 million requests a month. Expect under
£1/month unless it gets genuinely popular. Set a billing alarm under **Billing
and Cost Management → Budgets** if you want certainty.

## Removing it

**CloudFormation → select the stack → Delete**, for
`student-loan-calculator-ci` first, then `student-loan-calculator-site`.

The bucket is deliberately set to be retained, so it survives the stack rather
than silently destroying its contents. To remove it too: **S3 → select the
bucket → Empty**, type the confirmation, then **Delete**.

## If something goes wrong

| Symptom | Cause |
| --- | --- |
| Stack fails instantly on step 4 | The IAM acknowledgement checkbox was not ticked. |
| `Parameter GitHubRepository failed to satisfy constraint` | The value is not bare `owner/repo`. Usually the pasted URL (`https://github.com/...`), or a leading/trailing space, or backticks picked up with a copy. |
| `Export ... cannot be found` | `SiteStackName` does not match step 3's stack name, or that stack is in a different region. |
| `Provider with url ... already exists` | The account already has a GitHub OIDC provider. Delete the rolled-back stack and recreate it with `CreateOidcProvider` = `false`. See the note in step 4. |
| A stack is stuck in `ROLLBACK_COMPLETE` | Nothing was created; delete it before trying again. CloudFormation will not reuse the name until you do. |
| Deploy run fails at *Get temporary AWS credentials* | `AWS_DEPLOY_ROLE_ARN` is missing, mistyped, or saved as a *Secret* rather than a *Variable*. |
| `Could not assume role with OIDC: Request ARN is invalid` | `AWS_DEPLOY_ROLE_ARN` holds the OIDC provider ARN (`:oidc-provider/`) instead of the role ARN (`:role/`). Copy `DeployRoleArn` from the CI stack's Outputs tab. |
| Deploy run fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The role exists but its trust policy does not match the token. Usually: the branch is not the one in `GitHubRefPattern`; `GitHubRepository` has a `.git` suffix or wrong capitalisation; the job declares an `environment:` (see below); or the stack predates the immutable-subject support and needs updating with the current template. |
| Site shows an old version | CloudFront cache. The workflow invalidates it, but propagation takes a minute; hard-refresh. |
| **Actions** tab shows no *Run workflow* button | The workflow file is not on the default branch yet — finish step 1. |
