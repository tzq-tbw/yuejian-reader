# Run under a fresh Windows user or a disposable Windows runner.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Installer)

$ErrorActionPreference = 'Stop'
$database = Join-Path $env:APPDATA 'com.yuejian.reader'
if (Test-Path -LiteralPath $database) { throw 'A clean Windows user profile is required' }
$setupPath = (Resolve-Path -LiteralPath $Installer).Path
$target = Join-Path $env:LOCALAPPDATA "YuejianStage5-$PID"
$env:YUEJIAN_TEST_DB = Join-Path $database 'reader.db'
$env:YUEJIAN_TEST_SCHEMA = Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri/migrations/0001_core.sql'
$setup = Start-Process -FilePath $setupPath -ArgumentList ('/S /D=' + $target) -WindowStyle Hidden -PassThru -Wait
if ($setup.ExitCode -ne 0) { throw "NSIS exited with $($setup.ExitCode)" }
$binary = Join-Path $target 'yuejian.exe'
if (!(Test-Path -LiteralPath $binary)) { throw "Missing installed application at $binary" }
$exercise = @'
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

db = Path(os.environ["YUEJIAN_TEST_DB"])
schema = Path(os.environ["YUEJIAN_TEST_SCHEMA"])
db.parent.mkdir(parents=True, exist_ok=True)
with closing(sqlite3.connect(db, timeout=5)) as conn, conn:
    if sys.argv[1] == "seed":
        conn.executescript(schema.read_text(encoding="utf-8"))
        conn.executescript("""
            CREATE TABLE schema_migrations (
                version INTEGER PRIMARY KEY, name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO schema_migrations (version, name) VALUES (1, 'core');
            INSERT INTO articles (title, paragraphs) VALUES
                ('Stage 5 migration sample', '["We need to address the problem."]');
        """)
    else:
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert conn.execute("SELECT GROUP_CONCAT(version) FROM schema_migrations").fetchone()[0] == "1,2,3,4,5,6"
        article = conn.execute("SELECT title, paragraphs FROM articles").fetchone()
        assert article == ("Stage 5 migration sample", '["We need to address the problem."]')
        assert conn.execute("SELECT COUNT(*) FROM section_articles").fetchone()[0] == 1
'@
$exercise | python - seed
if ($LASTEXITCODE -ne 0) { throw 'Could not create the old database fixture' }

foreach ($attempt in 1, 2) {
    $app = Start-Process -FilePath $binary -PassThru
    try {
        $deadline = (Get-Date).AddSeconds(60)
        do {
            Start-Sleep -Milliseconds 500
            $app.Refresh()
            if ($app.HasExited) { throw "Installed application exited with $($app.ExitCode)" }
        } until ($app.MainWindowHandle -ne 0 -or (Get-Date) -gt $deadline)
        if ($app.MainWindowHandle -eq 0) { throw 'Installed application did not open a window' }
        $exercise | python - check
        if ($LASTEXITCODE -ne 0) { throw 'Database migration or persistence check failed' }
        Write-Host "Launch $attempt passed: window, migration versions 1–6, article and default section."
    } finally {
        if (!$app.HasExited) {
            $null = $app.CloseMainWindow()
            if (!$app.WaitForExit(8000)) { Stop-Process -Id $app.Id }
        }
    }
}
