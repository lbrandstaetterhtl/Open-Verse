# Osiris Strict Compliance Audit & Build Verification
# Usage: ./scripts/compliance-audit.ps1 [-Fix] [-SkipBuild]

param(
    [switch]$Fix,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$StartTime = Get-Date

# Set dummy env vars for static analysis tools (prevent crash on load)
$env:DATABASE_URL = "postgres://osiris:compliance_dummy@localhost:5432/osiris"
$env:USE_SQLITE = "true"

# Colors / Formatting
function Write-Header($msg) {
    Write-Host "`n==== $msg ====" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "V $msg" -ForegroundColor Green
}

function Write-Warning($msg) {
    Write-Host "! $msg" -ForegroundColor Yellow
}

function Write-ErrorMsg($msg) {
    Write-Host "X $msg" -ForegroundColor Red
}

$LogPath = "compliance-audit.log"
"Start Time: $($StartTime.ToString())`n" | Out-File -FilePath $LogPath -Encoding utf8

try {
    Write-Header "OSIRIS COMPLIANCE SCAN"

    # Step 1: Security Audit
    Write-Host "Searching for security vulnerabilities..."
    $AuditOutput = npm audit --audit-level=high 2>&1 | Out-String
    $HasVulnerabilities = $AuditOutput -match "high" -or $AuditOutput -match "critical"
    
    if ($HasVulnerabilities) {
        Write-ErrorMsg "Security vulnerabilities detected! Reviewing logs..."
        $AuditOutput | Out-File -FilePath "audit-failures.log" -Encoding utf8
        throw "Security audit failed. High/Critical vulnerabilities found."
    }
    Write-Success "Security audit passed."

    # Step 2: Dead Code Detection (Knip)
    Write-Host "Finding unused code..."
    try {
        $KnipOutput = npx knip --no-progress 2>&1 | Out-String
        $DeadCodeFound = $KnipOutput -match "Unused" -or $KnipOutput -match "Unlisted"
        
        if ($DeadCodeFound) {
            Write-Warning "Knip identified potential dead code or issues."
            $KnipOutput
            $KnipOutput | Out-File -FilePath "dead-code-report.txt" -Encoding utf8
            throw "Dead code detected. Osiris Zero-Tolerance policy violated. Fix the issues or ignore them in knip.json."
        }
        Write-Success "No significant dead code detected."
    } catch {
        if ($_.Exception.Message -match "Dead code detected") { throw $_ }
        Write-ErrorMsg "Knip execution failed (possibly due to environment or config)."
        Write-Host $_.Exception.Message
        throw "Quality gate failure."
    }

    # Step 3: Strict Linting (Oxlint)
    if ($Fix) {
        Write-Host "Fixing linting issues..."
        npx oxlint --config .oxlintrc.json --fix
        Write-Success "Auto-fixes applied."
    }

    Write-Host "Running strict linter..."
    $LintOutput = npx oxlint --config .oxlintrc.json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -and $LintOutput.Length -gt 0) {
        Write-ErrorMsg "Linting errors found!"
        $LintOutput
        throw "Strict linting failed."
    }
    Write-Success "All linting rules satisfied."

    # Step 4: Type Checking
    Write-Host "Verifying TypeScript..."
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript verification failed."
    }
    Write-Success "TypeScript integrity verified."

    # Step 5: Build Verification
    if (-not $SkipBuild) {
        Write-Header "BUILD VERIFICATION"
        Write-Host "Building production bundle..."
        $BuildOutput = npm run build:quick 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Production build failed."
            $BuildOutput
            throw "Production build failed."
        }
        Write-Success "Production build successful."
    }

    $EndTime = Get-Date
    $Duration = $EndTime - $StartTime
    Write-Header "AUDIT COMPLETE"
    Write-Success "Duration: $($Duration.Minutes)m $($Duration.Seconds)s"
    Write-Host "Project is compliant with Osiris Zero-Tolerance standards." -ForegroundColor Green

} catch {
    Write-Header "AUDIT ABORTED"
    Write-ErrorMsg $_.Message
    exit 1
}
