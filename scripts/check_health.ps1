$ErrorActionPreference = 'Stop'
$url = 'http://localhost:39017/api/health'

try {
  $res = Invoke-WebRequest -UseBasicParsing $url
  if ($res.StatusCode -eq 200) {
    Write-Host "Health check OK: $url"
    exit 0
  }
  Write-Error "Health check failed with status $($res.StatusCode)"
  exit 1
}
catch {
  Write-Error "Health check error: $($_.Exception.Message)"
  exit 1
}
