# VateSpira setup script - runs automatically when Agent Manager creates a worktree
# Backend reads root .env via langgraph.json + conftest.py
# Frontend reads root .env via dotenv in next.config.ts
# No env copies needed - everything reads root .env directly

$worktreePath = $env:WORKTREE_PATH
$repoPath = $env:REPO_PATH

if (-not $worktreePath) { $worktreePath = $PWD.Path }

Write-Host "=== VateSpira Worktree Setup ==="
Write-Host "Worktree: $worktreePath"

# 1. Verify root .env exists
$rootEnv = Join-Path $worktreePath ".env"
if (Test-Path $rootEnv) {
    Write-Host "[OK] Root .env found"
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
    pnpm install --no-frozen-lockfile 2>&1 | Out-Null
    Pop-Location
    Write-Host "[OK] Frontend deps installed"
}

Write-Host "=== Setup Complete ==="
