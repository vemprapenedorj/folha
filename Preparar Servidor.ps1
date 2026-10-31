$ErrorActionPreference = 'Stop'
$serverUrl = 'http://127.0.0.1:3000'

try {
  $current = Invoke-RestMethod -Uri "$serverUrl/api/version" -TimeoutSec 2
  if ($current.app -eq 'escala-hotel-titanic' -and $current.version -ge 3) { exit 0 }
} catch {
  # A versão antiga ainda não oferece este endpoint.
}

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $listener) { exit 1 }

$serverProcessId = [int]$listener.OwningProcess
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue
$isNodeServer = $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine -match '(^|[\\/\s])server\.mjs([\s"'']|$)'
$isThisApp = $false
try {
  $identity = Invoke-RestMethod -Uri "$serverUrl/api/me" -TimeoutSec 2
  $isThisApp = $null -ne $identity.PSObject.Properties['editor']
} catch {}

if (-not ($isNodeServer -and $isThisApp)) {
  Write-Host 'A porta 3000 está em uso por outro programa. Feche esse programa antes de iniciar a escala.'
  exit 2
}

Stop-Process -Id $serverProcessId -Force -ErrorAction Stop
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  $remaining = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($null -eq $remaining) { exit 1 }
}
Write-Host 'O servidor antigo não liberou a porta 3000. Feche a janela dele e tente novamente.'
exit 2
