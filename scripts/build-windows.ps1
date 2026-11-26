# Run from Windows PowerShell or pwsh. Releases use the maintainer's signing key.
[CmdletBinding()]
param([string]$Installer)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$config = Get-Content -Raw -Encoding UTF8 (Join-Path $project 'src-tauri/tauri.conf.json') | ConvertFrom-Json
$version = $config.version
$releaseBase = $config.plugins.updater.endpoints[0] -replace '/latest/download/latest\.json$', "/download/v$version"
if ($releaseBase -eq $config.plugins.updater.endpoints[0]) { throw 'Unexpected updater endpoint' }

if (!$Installer) {
    $providedKey = $env:TAURI_SIGNING_PRIVATE_KEY
    $providedPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
    Push-Location $project
    try {
        if (!$providedKey) {
            $vault = Join-Path $env:LOCALAPPDATA 'YuejianReaderSigning'
            $key = Join-Path $vault 'updater.key'
            if ((Get-Content -Raw -LiteralPath "$key.pub").Trim() -ne $config.plugins.updater.pubkey) {
                throw 'The local signing key does not match the public key in tauri.conf.json'
            }
            $secret = Get-Content -LiteralPath (Join-Path $vault 'password.dpapi') | ConvertTo-SecureString
            $env:TAURI_SIGNING_PRIVATE_KEY = $key
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', $secret).Password
        }
        npm.cmd run tauri:build
        if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
        $target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $project 'src-tauri/target' }
        $bundle = Join-Path $target 'release/bundle/nsis'
        $Installer = (Get-Item -LiteralPath (Join-Path $bundle "$($config.productName)_${version}_x64-setup.exe")).FullName
    } finally {
        $env:TAURI_SIGNING_PRIVATE_KEY = $providedKey
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $providedPassword
        Pop-Location
    }
}

$Installer = (Resolve-Path -LiteralPath $Installer).Path
if ((Split-Path -Leaf $Installer) -ne "$($config.productName)_${version}_x64-setup.exe") {
    throw "Expected the signed x64 NSIS installer for version $version"
}
$signature = (Get-Content -Raw -LiteralPath "$Installer.sig").Trim()
if (!$signature) { throw 'Missing Tauri updater signature' }
$releaseDir = Join-Path (Split-Path -Parent (Split-Path -Parent $Installer)) 'github'
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$name = "Yuejian-$version-x64-setup.exe"
Copy-Item -LiteralPath $Installer -Destination (Join-Path $releaseDir $name) -Force
Copy-Item -LiteralPath "$Installer.sig" -Destination (Join-Path $releaseDir "$name.sig") -Force
$manifest = [ordered]@{
    version = $version
    pub_date = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = @{ 'windows-x86_64' = @{ signature = $signature; url = "$releaseBase/$name" } }
}
[IO.File]::WriteAllText((Join-Path $releaseDir 'latest.json'), ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Host "Release assets: $releaseDir (tag v$version)"
