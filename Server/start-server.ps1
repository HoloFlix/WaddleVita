# One-click start of the WaddleVita server (Windows): checks everything the first run needs, fixes what it can, then starts
# Waddle Forever's server and the companion and shows the address for the Vita.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ports = 24105, 24106, 24107, 24110
$releases = 'https://github.com/nhaar/Waddle-Forever/releases'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Ask($question) { $a = Read-Host "$question [Y/n]"; return ($a -ne 'n' -and $a -ne 'N') }

# ---- 1. Waddle Forever ----
function Find-WaddleForever {
    if ($env:WF_APP -and (Test-Path (Join-Path $env:WF_APP 'compiled\server\boot.js'))) { return $env:WF_APP }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Waddle Forever\resources\app'),
        (Join-Path $env:ProgramFiles 'Waddle Forever\resources\app'),
        (Join-Path ${env:ProgramFiles(x86)} 'Waddle Forever\resources\app')
    )
    # the installer's own record of where it put the program
    foreach ($key in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
        try {
            Get-ChildItem $key -ErrorAction Stop | ForEach-Object {
                $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
                if ($p.DisplayName -like 'Waddle Forever*' -and $p.InstallLocation) { $candidates += (Join-Path $p.InstallLocation 'resources\app') }
            }
        } catch { }
    }
    foreach ($c in $candidates) { if ($c -and (Test-Path (Join-Path $c 'compiled\server\boot.js'))) { return $c } }
    return $null
}

$wf = Find-WaddleForever
if (-not $wf) {
    Say 'Waddle Forever was not found on this PC.' Red
    Say 'WaddleVita uses it for the game files and the server. Install it, start it once so it finishes setting up, close it, then run this again.'
    if (Ask 'Open the Waddle Forever download page now?') { Start-Process $releases }
    exit 1
}
$env:WF_APP = $wf
$exe = Join-Path $wf '..\..\Waddle Forever.exe'
$media = @((Join-Path $wf '..\..\media\default'), (Join-Path $wf 'media\default')) | Where-Object { Test-Path $_ }
if (-not $media) {
    Say 'Waddle Forever is installed but its game files (the media folder) are not there yet.' Yellow
    Say 'Start Waddle Forever once and let it finish downloading, close it, then run this again.'
    exit 1
}
Say "Found Waddle Forever: $wf" DarkGray

# ---- 2. Waddle Forever's own window must be closed (same ports) ----
$running = Get-Process -Name 'Waddle Forever' -ErrorAction SilentlyContinue
if ($running) {
    Say "Waddle Forever's own app is open. It uses the same ports as this server." Yellow
    if (Ask 'Close it now?') {
        $running | Stop-Process -Force
        Start-Sleep -Seconds 2
    } else { exit 1 }
}

# ---- 3. Is something else using our ports? (often an earlier run of this window) ----
$busy = @()
foreach ($p in $ports) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { $busy += [pscustomobject]@{ Port = $p; Pid = $c.OwningProcess; Name = (Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue).ProcessName } }
}
if ($busy) {
    Say 'These ports are already in use:' Yellow
    $busy | ForEach-Object { Say ("  port {0}: {1} (process {2})" -f $_.Port, $_.Name, $_.Pid) Yellow }
    # only programs that are clearly ours: Waddle Forever itself, or something running companion.js
    $ours = $busy | Where-Object {
        $line = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Pid)" -ErrorAction SilentlyContinue).CommandLine
        $_.Name -eq 'Waddle Forever' -or ($line -and $line -match 'companion\.js')
    }
    if ($ours -and ($ours.Count -eq $busy.Count) -and (Ask 'Stop those (they are an earlier WaddleVita / Waddle Forever server)?')) {
        $ours | ForEach-Object { Stop-Process -Id $_.Pid -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
    } else {
        Say 'Close the program that uses them and run this again.' Red
        exit 1
    }
}

# ---- 4. Windows Firewall: the Vita must reach the server and hear the broadcast ----
$ruleName = 'WaddleVita server'
$haveRule = $false
try { $haveRule = [bool](Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) } catch { }
if (-not $haveRule) {
    $cmd = "New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 24105-24107,24110 -Profile Any | Out-Null; New-NetFirewallRule -DisplayName '$ruleName (discovery)' -Direction Inbound -Action Allow -Protocol UDP -LocalPort 24111 -Profile Any | Out-Null"
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Say 'Windows Firewall has to allow the Vita in (ports 24105-24107, 24110 and 24111 on your home network). This is done once.' Yellow
    if ($admin) {
        Invoke-Expression $cmd
        Say 'Firewall: done.' Green
    } elseif (Ask 'Allow it now? Windows will ask for administrator permission.') {
        try { Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $cmd; Say 'Firewall: done.' Green } catch { Say 'Skipped. The Vita may not be able to connect.' Red }
    } else { Say 'Skipped. The Vita may not be able to connect.' Red }
}

# ---- 5. Node: the one on PATH, or the one inside Waddle Forever (it is Electron, which can run as plain Node) ----
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    if (Test-Path $exe) { $node = (Resolve-Path $exe).Path; $env:ELECTRON_RUN_AS_NODE = '1' }
}
if (-not $node) { Say 'Node.js was not found. Install it from https://nodejs.org (or reinstall Waddle Forever).' Red; exit 1 }

Say 'Starting the server...' DarkGray
& $node (Join-Path $here 'companion.js')
