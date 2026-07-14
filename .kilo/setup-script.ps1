# VateSpira setup script — runs automatically when Agent Manager creates a worktree
# Copies root .env to nested locations (backend/.env, frontend/.env.local)

$worktreePath = $env:WORKTREE_PATH
$repoPath = $env:REPO_PATH

Write-Host "=== VateSpira Worktree Setup ==="
Write-Host "Worktree: $worktreePath"
Write-Host "Repo root: $repoPath"

# 1. Copy root .env to backend/.env
$rootEnv = Join-Path $worktreePath ".env"
$backendEnv = Join-Path $worktreePath "backend\.env"
if (Test-Path $rootEnv) {
    if (-not (Test-Path $backendEnv)) {
        Copy-Item $rootEnv $backendEnv
        Write-Host "[OK] Copied .env -> backend/.env"
    } else {
        Write-Host "[SKIP] backend/.env already exists"
    }
} else {
    Write-Host "[WARN] No root .env found. Create it at repo root with real credentials."
    Write-Host "       See backend/.env.example for required vars."
}

# 2. Copy NEXT_PUBLIC_ vars to frontend/.env.local
$frontendEnv = Join-Path $worktreePath "frontend\.env.local"
if (Test-Path $rootEnv) {
    $publicVars = Get-Content $rootEnv | Where-Object { $_ -match "^NEXT_PUBLIC_" }
    if ($publicVars -and -not (Test-Path $frontendEnv)) {
        $publicVars | Set-Content $frontendEnv -Encoding utf8
        Write-Host "[OK] Created frontend/.env.local with NEXT_PUBLIC_ vars"
    } elseif (Test-Path $frontendEnv) {
        Write-Host "[SKIP] frontend/.env.local already exists"
    } else {
        # No NEXT_PUBLIC_ vars in root .env — create from Supabase vars
        $supabaseUrl = (Get-Content $rootEnv | Select-String "SUPABASE_URL=(.+)").Matches.Groups[1].Value
        $supabaseKey = (Get-Content $rootEnv | Select-String "SUPABASE_ANON_KEY=(.+)").Matches.Groups[1].Value
        if ($supabaseUrl -and $supabaseKey) {
            @"
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseKey
"@ | Set-Content $frontendEnv -Encoding utf8
            Write-Host "[OK] Created frontend/.env.local from SUPABASE_URL + SUPABASE_ANON_KEY"
        } else {
            Write-Host "[WARN] No NEXT_PUBLIC_ or SUPABASE vars in root .env"
        }
    }
} else {
    Write-Host "[SKIP] No root .env — frontend/.env.local not created"
}

# 3. Install backend deps
$backendPath = Join-Path $worktreePath "backend"
if (Test-Path (Join-Path $backendPath "pyproject.toml")) {
    Write-Host "[INFO] Installing backend deps (uv sync)..."
    Push-Location $backendPath
    uv sync 2>&1 | Out-Null
    Pop-Location
    Write-Host "[OK] Backend deps installed"
}

# 4. Install frontend deps
$frontendPath = Join-Path $worktreePath "frontend"
if (Test-Path (Join-Path $frontendPath "package.json")) {
    Write-Host "[INFO] Installing frontend deps (pnpm install)..."
    Push-Location $frontendPath
    pnpm install 2>&1 | Out-Null
    Pop-Location
    Write-Host "[OK] Frontend deps installed"
}

Write-Host "=== Setup Complete ==="