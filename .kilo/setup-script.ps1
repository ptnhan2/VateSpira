# VateSpira setup script - runs automatically when Agent Manager creates a worktree
# Copies root .env to frontend/.env.local (Next.js requires .env* in frontend/)
# Backend reads root .env directly via langgraph.json + conftest.py (no copy needed)

$worktreePath = $env:WORKTREE_PATH
$repoPath = $env:REPO_PATH

if (-not $worktreePath) { $worktreePath = $PWD.Path }

Write-Host "=== VateSpira Worktree Setup ==="
Write-Host "Worktree: $worktreePath"

# 1. Copy root .env to frontend/.env.local (straight copy - Next.js picks NEXT_PUBLIC_ vars)
$rootEnv = Join-Path $worktreePath ".env"
$frontendEnv = Join-Path $worktreePath "frontend\.env.local"
if ((Test-Path $rootEnv) -and (-not (Test-Path $frontendEnv))) {
    Copy-Item $rootEnv $frontendEnv
    Write-Host "[OK] Copied .env -> frontend/.env.local"
} elseif (Test-Path $frontendEnv) {
    Write-Host "[SKIP] frontend/.env.local already exists"
} else {
    Write-Host "[WARN] No root .env found. Create it at repo root with real credentials."
}

# 2. Install backend deps
$backendPath = Join-Path $worktreePath "backend"
if (Test-Path (Join-Path $backendPath "pyproject.toml")) {
    Write-Host "[INFO] Installing backend deps (uv sync)..."
    Push-Location $backendPath
    uv sync 2>&1 | Out-Null
    Pop-Location
    Write-Host "[OK] Backend deps installed"
}

# 3. Install frontend deps
$frontendPath = Join-Path $worktreePath "frontend"
if (Test-Path (Join-Path $frontendPath "package.json")) {
    Write-Host "[INFO] Installing frontend deps (pnpm install)..."
    Push-Location $frontendPath
    pnpm install 2>&1 | Out-Null
    Pop-Location
    Write-Host "[OK] Frontend deps installed"
}

Write-Host "=== Setup Complete ==="
