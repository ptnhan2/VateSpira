# VateSpira run script — starts dev servers for Agent Manager "Run" button
$worktreePath = $env:WORKTREE_PATH

Write-Host "=== VateSpira Dev Servers ==="

# Start backend (langgraph dev on port 2024)
$backendPath = Join-Path $worktreePath "backend"
if (Test-Path (Join-Path $backendPath "pyproject.toml")) {
    Write-Host "[INFO] Starting backend (langgraph dev, port 2024)..."
    Start-Process -FilePath "uv" -ArgumentList "run", "langgraph", "dev" -WorkingDirectory $backendPath -NoNewWindow
}

# Start frontend (next dev on port 3000)
$frontendPath = Join-Path $worktreePath "frontend"
if (Test-Path (Join-Path $frontendPath "package.json")) {
    Write-Host "[INFO] Starting frontend (next dev, port 3000)..."
    Start-Process -FilePath "pnpm" -ArgumentList "dev" -WorkingDirectory $frontendPath -NoNewWindow
}

Write-Host "=== Dev servers starting ==="
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend: http://localhost:2024"