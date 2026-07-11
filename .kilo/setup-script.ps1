# VateSpira — Agent Manager Setup Script
# Runs when a worktree is created, BEFORE agent session starts.
# Sets default_agent based on branch name so worktree sessions auto-use the right agent.

$branch = git branch --show-current 2>$null
$configPath = Join-Path $PWD "kilo.json"

if ($branch -match "^feat/" -or $branch -match "^fix/") {
    $config = @{ default_agent = "worker" } | ConvertTo-Json -Compress
    Set-Content -LiteralPath $configPath -Value $config -Encoding utf8 -NoNewline
    Write-Output "[setup] default_agent = worker (branch: $branch)"
} elseif ($branch -match "^review/") {
    $config = @{ default_agent = "reviewer" } | ConvertTo-Json -Compress
    Set-Content -LiteralPath $configPath -Value $config -Encoding utf8 -NoNewline
    Write-Output "[setup] default_agent = reviewer (branch: $branch)"
} else {
    Write-Output "[setup] default agent unchanged (branch: $branch)"
}