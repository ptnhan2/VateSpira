#Requires -Version 5.1
<#
.SYNOPSIS
  Setup Supabase database for VateSpira - chay migrations + dev adjustments.

.DESCRIPTION
  Đọc SUPABASE_DB_PASSWORD từ frontend/.env.local, kết nối psql trực tiếp vào
  Supabase Postgres, chạy tất cả migration files trong supabase/migrations/,
  sau đó apply dev adjustments (disable RLS + user_id nullable) để test không cần auth.

  Chạy 1 lần duy nhất. Khi wire Supabase Auth, re-enable RLS + user_id NOT NULL.

.USAGE
  1. Thêm dòng SUPABASE_DB_PASSWORD=your-password vào frontend/.env.local
  2. Chạy: .\scripts\setup-db.ps1
#>

$ErrorActionPreference = "Stop"

# --- Read credentials from frontend/.env.local ---
$envFile = Join-Path $PSScriptRoot "..\frontend\.env.local"
if (-not (Test-Path $envFile)) {
    Write-Error "frontend/.env.local not found. Run this script from the worktree root."
    exit 1
}

$envLines = Get-Content $envFile
$dbPassword = ($envLines | Where-Object { $_ -match "^SUPABASE_DB_PASSWORD=" }) -replace "^SUPABASE_DB_PASSWORD=", ""
$supabaseUrl = ($envLines | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_URL=" }) -replace "^NEXT_PUBLIC_SUPABASE_URL=", ""

if (-not $dbPassword -or $dbPassword -eq "your-db-password") {
    Write-Error @(
        "SUPABASE_DB_PASSWORD not set in frontend/.env.local.",
        "Add this line to frontend/.env.local:",
        "  SUPABASE_DB_PASSWORD=your-database-password",
        "",
        "Find it: Supabase Dashboard > Settings > Database > Connection string"
    ) -join "`n"
    exit 1
}

# --- Extract project ref from URL (https://xxxxx.supabase.co -> xxxxx) ---
$projectRef = $supabaseUrl -replace "^https?://", "" -replace "\.supabase\.co.*", ""
$dbHost = "db.$projectRef.supabase.co"
$connString = "host=$dbHost port=5432 user=postgres dbname=postgres password=$dbPassword sslmode=require"

Write-Host "Connecting to $dbHost ..." -ForegroundColor Cyan

# --- Verify psql is available ---
$psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psqlPath) {
    Write-Error "psql not found. Install PostgreSQL client tools."
    exit 1
}

# --- Run all migration files in order ---
$migrationsDir = Join-Path $PSScriptRoot "..\supabase\migrations"
$migrations = Get-ChildItem "$migrationsDir\*.sql" | Sort-Object Name

if ($migrations.Count -eq 0) {
    Write-Warning "No migration files found in $migrationsDir"
}

foreach ($migration in $migrations) {
    Write-Host "  Running migration: $($migration.Name)" -ForegroundColor Yellow
    & psql "$connString" -f $migration.FullName -q 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed: $($migration.Name)"
        exit 1
    }
}

# --- Dev adjustments: allow testing without Supabase Auth ---
# TODO(auth): Remove these when Supabase Auth login is wired (UF-1 full).
# Re-enable with: ALTER TABLE novels ENABLE ROW LEVEL SECURITY;
#                  ALTER TABLE novels ALTER COLUMN user_id SET NOT NULL;
Write-Host "  Applying dev adjustments (disable RLS + nullable user_id)..." -ForegroundColor Yellow
$devSql = @(
    "ALTER TABLE novels ALTER COLUMN user_id DROP NOT NULL;"
    "ALTER TABLE novels DISABLE ROW LEVEL SECURITY;"
) -join " "
& psql "$connString" -c $devSql -q 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
if ($LASTEXITCODE -ne 0) {
    Write-Error "Dev adjustments failed"
    exit 1
}

Write-Host ""
Write-Host "[OK] Database setup complete!" -ForegroundColor Green
Write-Host "  - All migrations applied"
Write-Host "  - genre column added to novels"
Write-Host "  - RLS disabled (dev mode - no auth required)"
Write-Host "  - user_id nullable (dev mode - insert without login works)"
