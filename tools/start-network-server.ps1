param(
  [int]$Port = 8080,
  [string]$HostName = "0.0.0.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root "server"

Write-Host "Street Racer multiplayer server"
Write-Host "Host: $HostName"
Write-Host "Port: $Port"
Write-Host "Health: http://127.0.0.1:$Port/health"
Write-Host "LAN WebSocket: ws://<your-lan-ip>:$Port"

Push-Location $serverDir
try {
  if (-not (Test-Path "node_modules")) {
    npm install
  }
  $env:HOST = $HostName
  $env:PORT = [string]$Port
  node src/index.js
} finally {
  Pop-Location
}
