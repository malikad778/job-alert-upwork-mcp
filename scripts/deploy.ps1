<#
.SYNOPSIS
    Deploys Job Radar to a fresh EC2 instance from the LOCAL working directory.

.DESCRIPTION
    The previous version ran `git clone` against the public GitHub repository on
    the instance. That no longer works: the Next.js UI is deliberately excluded
    from the public repo, so a clone produces a build without a front-end.

    This version packages the local workspace (private UI included), uploads it
    to a private S3 bucket, and has the instance pull it down via its IAM role.

    The archive carries .env, so it is treated as a secret: the bucket blocks all
    public access, enforces AES-256 encryption, and expires objects after 7 days.
    This also removes the old behaviour of embedding .env in EC2 user-data, which
    left credentials readable via the instance metadata service.

.PARAMETER KeepArchive
    Keep the local .tar.gz after upload (useful for inspecting what shipped).

.PARAMETER InstanceType
    EC2 instance type. Defaults to t3.small.

.EXAMPLE
    pwsh scripts/deploy.ps1
#>
[CmdletBinding()]
param(
    [switch]$KeepArchive,
    [string]$InstanceType = "t3.small"
)

$ErrorActionPreference = "Stop"

<#
    Runs an AWS CLI command that is EXPECTED to be able to fail (existence
    probes). Windows PowerShell 5.1 turns any stderr output from a native
    executable into an ErrorRecord, which under $ErrorActionPreference = 'Stop'
    aborts the script even when the command merely reported "not found".
    Returns the exit code; stderr is swallowed.
#>
function Invoke-AwsProbe {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AwsArgs)

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & aws @AwsArgs 2>&1 | Out-Null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}

<#
    Writes UTF-8 WITHOUT a byte order mark.
    Set-Content -Encoding utf8 emits a BOM on Windows PowerShell 5.1, and the
    AWS CLI fails to parse any JSON parameter file that starts with one.
#>
function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding $false))
}

<# Same protection, but returns the command's stdout as a trimmed string. #>
function Get-AwsValue {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AwsArgs)

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & aws @AwsArgs 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
        return ($out | Out-String).Trim()
    } finally {
        $ErrorActionPreference = $previous
    }
}

# Resolve the repo root from this script's location so the script works no
# matter which directory it is invoked from.
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {

    # ── Preflight ─────────────────────────────────────────────────────────────
    Write-Host "==> Verifying AWS credentials..." -ForegroundColor Cyan
    $identityJson = Get-AwsValue sts get-caller-identity --output json
    if (-not $identityJson) {
        Write-Host "AWS credentials are not configured or have expired." -ForegroundColor Red
        Write-Host "Run 'aws configure' (or 'aws sso login' if you use SSO) and try again."
        exit 1
    }
    $identity = $identityJson | ConvertFrom-Json
    $accountId = $identity.Account

    $region = (aws configure get region 2>$null)
    if (-not $region) { $region = $env:AWS_REGION }
    if (-not $region) { $region = "ap-south-1" }
    $region = $region.Trim()

    Write-Host "    Account: $accountId   Region: $region" -ForegroundColor DarkGray

    if (-not (Test-Path ".env")) {
        Write-Host "No .env found at the repo root. The app will not start without it." -ForegroundColor Red
        Write-Host "Create .env (copy .env.example) before deploying."
        exit 1
    }

    $bucket = "job-radar-deploy-$accountId"
    $roleName = "job-radar-ec2-role"
    $profileName = "job-radar-ec2-profile"
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $archiveName = "deploy-$stamp.tar.gz"
    $archivePath = Join-Path $repoRoot $archiveName
    $s3Key = "releases/$archiveName"

    # ── Package the local workspace ───────────────────────────────────────────
    Write-Host "==> Packaging local workspace..." -ForegroundColor Cyan

    # .env is intentionally NOT excluded - the instance needs it and it never
    # reaches git. .next is excluded so the instance builds from clean sources.
    $excludes = @(
        "--exclude=./.git",
        "--exclude=./node_modules",
        "--exclude=*/node_modules",
        "--exclude=./.next",
        "--exclude=*/.next",
        "--exclude=./scratch",
        "--exclude=*.tar.gz",
        "--exclude=*.zip",
        "--exclude=*.tsbuildinfo"
    )

    tar -czf $archivePath @excludes -C $repoRoot .
    if ($LASTEXITCODE -ne 0) { throw "Failed to create deployment archive." }

    $sizeMb = [math]::Round((Get-Item $archivePath).Length / 1MB, 1)
    Write-Host "    Created $archiveName ($sizeMb MB)" -ForegroundColor DarkGray

    # Fail fast if the private UI did not make it into the archive - that is the
    # whole reason this script exists.
    $manifest = tar -tzf $archivePath
    if ($manifest -notcontains "./apps/web/src/app/page.tsx") {
        throw "Private UI missing from archive (apps/web/src/app/page.tsx). Aborting."
    }
    Write-Host "    Verified private UI is included." -ForegroundColor DarkGray

    # ── Ensure the private release bucket exists ──────────────────────────────
    Write-Host "==> Ensuring S3 bucket '$bucket'..." -ForegroundColor Cyan
    $bucketMissing = (Invoke-AwsProbe s3api head-bucket --bucket $bucket) -ne 0
    if ($bucketMissing) {
        # us-east-1 rejects an explicit LocationConstraint; every other region requires it.
        if ($region -eq "us-east-1") {
            aws s3api create-bucket --bucket $bucket --region $region | Out-Null
        } else {
            aws s3api create-bucket --bucket $bucket --region $region `
                --create-bucket-configuration "LocationConstraint=$region" | Out-Null
        }
        if ($LASTEXITCODE -ne 0) { throw "Could not create bucket $bucket." }
        Write-Host "    Created bucket." -ForegroundColor DarkGray
    } else {
        Write-Host "    Bucket already exists." -ForegroundColor DarkGray
    }

    # The archive contains .env, so lock the bucket down every run rather than
    # trusting that it was configured correctly once.
    # JSON goes through temp files: quoting inline JSON through PowerShell into
    # the AWS CLI is unreliable across PowerShell/CLI versions.
    aws s3api put-public-access-block --bucket $bucket `
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null

    $encFile = Join-Path $env:TEMP "job-radar-enc-$stamp.json"
    Write-Utf8NoBom -Path $encFile -Content '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
    aws s3api put-bucket-encryption --bucket $bucket --server-side-encryption-configuration "file://$encFile" | Out-Null
    Remove-Item $encFile -Force -ErrorAction SilentlyContinue

    $lcFile = Join-Path $env:TEMP "job-radar-lifecycle-$stamp.json"
    Write-Utf8NoBom -Path $lcFile -Content '{"Rules":[{"ID":"expire-releases","Status":"Enabled","Filter":{"Prefix":"releases/"},"Expiration":{"Days":7}}]}'
    aws s3api put-bucket-lifecycle-configuration --bucket $bucket --lifecycle-configuration "file://$lcFile" | Out-Null
    Remove-Item $lcFile -Force -ErrorAction SilentlyContinue

    # ── Grant the instance role read access to this bucket ────────────────────
    Write-Host "==> Granting $roleName read access to the bucket..." -ForegroundColor Cyan
    $s3Policy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::$bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::$bucket"
    }
  ]
}
"@
    $policyFile = Join-Path $env:TEMP "job-radar-s3-policy-$stamp.json"
    Write-Utf8NoBom -Path $policyFile -Content $s3Policy

    aws iam put-role-policy --role-name $roleName `
        --policy-name "job-radar-deploy-s3-read" `
        --policy-document "file://$policyFile" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not attach S3 read policy to $roleName." }
    Remove-Item $policyFile -Force -ErrorAction SilentlyContinue
    Write-Host "    Policy attached." -ForegroundColor DarkGray

    # ── Upload ────────────────────────────────────────────────────────────────
    Write-Host "==> Uploading archive to s3://$bucket/$s3Key ..." -ForegroundColor Cyan
    aws s3 cp $archivePath "s3://$bucket/$s3Key" --sse AES256 --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Upload to S3 failed." }
    Write-Host "    Upload complete." -ForegroundColor DarkGray

    # ── Networking ────────────────────────────────────────────────────────────
    Write-Host "==> Resolving default VPC..." -ForegroundColor Cyan
    $vpcId = (aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text).Trim()
    if (-not $vpcId -or $vpcId -eq "None") { throw "No default VPC found. Specify a VPC manually." }
    Write-Host "    VPC: $vpcId" -ForegroundColor DarkGray

    $sgName = "job-radar-sg"
    $sgId = Get-AwsValue ec2 describe-security-groups `
        --filters "Name=group-name,Values=$sgName" "Name=vpc-id,Values=$vpcId" `
        --query "SecurityGroups[0].GroupId" --output text

    if (-not $sgId -or $sgId -eq "None") {
        Write-Host "==> Creating security group '$sgName'..." -ForegroundColor Cyan
        $sgId = (aws ec2 create-security-group --group-name $sgName `
            --description "Security group for Job Radar Web App" --vpc-id $vpcId `
            --query "GroupId" --output text).Trim()

        aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 | Out-Null
        aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 443 --cidr 0.0.0.0/0 | Out-Null
        Write-Host "    Created $sgId (ports 80/443). SSH is closed - use SSM Session Manager." -ForegroundColor DarkGray
    } else {
        Write-Host "    Reusing security group $sgId" -ForegroundColor DarkGray
    }

    Write-Host "==> Resolving latest Amazon Linux 2023 AMI..." -ForegroundColor Cyan
    $amiId = (aws ec2 describe-images --owners amazon `
        --filters "Name=name,Values=al2023-ami-2023.*-x86_64" `
        --query "sort_by(Images, &CreationDate)[-1].ImageId" --output text).Trim()
    Write-Host "    AMI: $amiId" -ForegroundColor DarkGray

    # ── User data ─────────────────────────────────────────────────────────────
    # No secrets are embedded here - only the S3 location, which is useless
    # without the instance role.
    $userData = @"
#!/bin/bash
exec > /var/log/user-data.log 2>&1
set -x
export PATH="/usr/local/bin:/usr/bin:/bin:`$PATH"

APP_DIR=/home/ec2-user/job-radar-upwork-mcp

echo "==> Setting up 2GB swap..."
dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

echo "==> Installing Docker, tar and AWS CLI..."
yum update -y
yum install -y docker tar gzip awscli

systemctl start docker
systemctl enable docker

echo "==> Starting Postgres container..."
docker run -d --name postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=job_radar \
  -v postgres_data:/var/lib/postgresql/data \
  --restart always \
  postgres:16-alpine

echo "==> Installing Node.js 22 and pnpm..."
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs
npm install -g pnpm@9.15.4

echo "==> Downloading release archive from S3..."
mkdir -p "`$APP_DIR"
aws s3 cp "s3://$bucket/$s3Key" /tmp/release.tar.gz --region $region
if [ ! -f /tmp/release.tar.gz ]; then
  echo "FATAL: could not download release archive from S3."
  exit 1
fi

echo "==> Extracting release..."
tar -xzf /tmp/release.tar.gz -C "`$APP_DIR"
rm -f /tmp/release.tar.gz
chown -R ec2-user:ec2-user "`$APP_DIR"

cd "`$APP_DIR"

if [ ! -f .env ]; then
  echo "FATAL: .env missing from the archive."
  exit 1
fi

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Waiting for Postgres..."
until docker exec postgres pg_isready -U postgres -d job_radar; do
  sleep 2
done

echo "==> Applying database migrations..."
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_radar
pnpm --filter @job-radar/db db:migrate || pnpm --filter @job-radar/db db:push --force

echo "==> Building all packages..."
pnpm --recursive run build

echo "==> Installing systemd services..."
cat << 'EOF' > /etc/systemd/system/jobradar.service
[Unit]
Description=Job Radar Web Application
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/ec2-user/job-radar-upwork-mcp/apps/web
EnvironmentFile=/home/ec2-user/job-radar-upwork-mcp/.env
Environment=NODE_ENV=production
Environment=PORT=80
Environment=HOSTNAME=0.0.0.0
Environment=DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_radar
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env npx next start -p 80 -H 0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# The poller is what actually fills the dashboard and sends WhatsApp alerts.
# Without it the site renders but every metric stays at zero.
cat << 'EOF' > /etc/systemd/system/jobradar-worker.service
[Unit]
Description=Job Radar Background Poller
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/ec2-user/job-radar-upwork-mcp/apps/jobs
EnvironmentFile=/home/ec2-user/job-radar-upwork-mcp/.env
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_radar
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable jobradar jobradar-worker
systemctl start jobradar
systemctl start jobradar-worker || echo "WARN: worker failed to start; check apps/jobs start script."

echo "==> Deployment complete."
systemctl status jobradar --no-pager || true
"@

    $userDataBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($userData))

    # ── Launch ────────────────────────────────────────────────────────────────
    Write-Host "==> Launching EC2 instance ($InstanceType)..." -ForegroundColor Cyan
    $instanceId = (aws ec2 run-instances `
        --image-id $amiId `
        --instance-type $InstanceType `
        --security-group-ids $sgId `
        --iam-instance-profile "Name=$profileName" `
        --user-data $userDataBase64 `
        --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true}" `
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=job-radar-web},{Key=Release,Value=$stamp}]" `
        --query "Instances[0].InstanceId" --output text).Trim()

    Write-Host "    Instance: $instanceId" -ForegroundColor DarkGray

    Write-Host "==> Waiting for the instance to reach 'running'..." -ForegroundColor Cyan
    aws ec2 wait instance-running --instance-ids $instanceId

    $publicIp = (aws ec2 describe-instances --instance-ids $instanceId `
        --query "Reservations[0].Instances[0].PublicIpAddress" --output text).Trim()

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Deployment launched" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Instance : $instanceId"
    Write-Host " Public IP: $publicIp"
    Write-Host " URL      : http://$publicIp"
    Write-Host " Release  : s3://$bucket/$s3Key"
    Write-Host ""
    Write-Host " Bootstrap takes ~3-5 minutes (install + build)."
    Write-Host " Follow progress:"
    Write-Host "   aws ssm start-session --target $instanceId"
    Write-Host "   sudo tail -f /var/log/user-data.log"
    Write-Host ""
    Write-Host " Remember to terminate the previous instance once this one is healthy:" -ForegroundColor Yellow
    Write-Host "   aws ec2 describe-instances --filters 'Name=tag:Name,Values=job-radar-web' 'Name=instance-state-name,Values=running' --query 'Reservations[].Instances[].[InstanceId,PublicIpAddress,LaunchTime]' --output table"
    Write-Host "========================================" -ForegroundColor Green

    if (-not $KeepArchive) {
        Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "Local archive kept at $archivePath" -ForegroundColor DarkGray
    }
}
finally {
    Pop-Location
}
