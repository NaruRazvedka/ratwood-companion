param([switch]$CompileOnly)
$ErrorActionPreference = 'Stop'
$compiler = 'C:/Program Files (x86)/BYOND/bin/dm.exe'
$daemon = 'C:/Program Files (x86)/BYOND/bin/dd.exe'
$labProcess = $null
Push-Location -LiteralPath $PSScriptRoot
try {
    python prepare.py
    if ($LASTEXITCODE -ne 0) { throw 'Mechanics fixture preparation failed.' }
    & $compiler mechanics.dme
    if ($LASTEXITCODE -ne 0) { throw 'Mechanics fixture compilation failed.' }
    if ($CompileOnly) { return }
    Remove-Item -LiteralPath results.json -ErrorAction SilentlyContinue
    $labProcess = Start-Process -FilePath $daemon -ArgumentList @('mechanics.dmb', '54397', '-ports', '54397', '-ip', '127.0.0.1', '-invisible', '-safe', '-close', '-once', '-logself') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    if (-not $labProcess.WaitForExit(30000)) { throw 'Mechanics fixture exceeded 30 seconds.' }
    $results = Get-Content -Raw -LiteralPath results.json | ConvertFrom-Json
    if ($results.passed -ne $results.total) { throw "Native check failure: $($results.passed)/$($results.total)" }
    $results | Add-Member -NotePropertyName manifestSha256 -NotePropertyValue (Get-FileHash manifest.json -Algorithm SHA256).Hash.ToLowerInvariant()
    $results | Add-Member -NotePropertyName recordedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    $results | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath results.json -Encoding utf8
    $results | Select-Object byondVersion, passed, total
} finally {
    if ($labProcess -and -not $labProcess.HasExited) { Stop-Process -Id $labProcess.Id }
    Pop-Location
}
