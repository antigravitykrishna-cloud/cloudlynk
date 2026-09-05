# Self-contained: uploads the Jollify v0.5.0 APK to the demo-builds bucket
# via TUS resumable upload, and prints a 7-day signed URL.
#
# Run from project root:  pwsh scripts/upload-demo-apk.ps1
#
# Reads the service role key from .env so it never appears in shell history.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$apkPath = Join-Path $root 'android/app/build/outputs/apk/release/app-release.apk'

if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }
if (-not (Test-Path $apkPath)) { throw "APK not found at $apkPath" }

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$supabaseUrl = $env:EXPO_PUBLIC_SUPABASE_URL
$secretKey = $env:SUPABASE_SECRET_KEY
if (-not $supabaseUrl -or -not $secretKey) { throw "Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env" }

$bucket = 'demo-builds'
$objectName = 'jollify-v0.5.0-demo.apk'
$expiresIn = 60 * 60 * 24 * 7   # 7 days
$chunkSize = 6MB                # TUS-recommended chunk

$headers = @{
  Authorization  = "Bearer $secretKey"
  apikey         = $secretKey   # Supabase Storage requires both for service-role
  'Tus-Resumable' = '1.0.0'
}

Write-Host "--- TUS upload ---"
$apkSize = (Get-Item $apkPath).Length
Write-Host "  size: $([math]::Round($apkSize / 1MB, 2)) MB, chunk: $([math]::Round($chunkSize / 1MB, 2)) MB"

$meta = 'bucketName ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bucket)) +
        ',objectName ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($objectName)) +
        ',contentType ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('application/vnd.android.package-archive'))

$createHeaders = $headers.Clone()
$createHeaders['Upload-Length'] = "$apkSize"
$createHeaders['Upload-Metadata'] = $meta
$createHeaders['x-upsert'] = 'true'

$createReq = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, "$supabaseUrl/storage/v1/upload/resumable")
foreach ($k in $createHeaders.Keys) { $createReq.Headers.TryAddWithoutValidation($k, $createHeaders[$k]) | Out-Null }

$http = [Net.Http.HttpClient]::new()
$createResp = $http.SendAsync($createReq).GetAwaiter().GetResult()
if (-not $createResp.IsSuccessStatusCode) {
  $err = $createResp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  throw "TUS create failed: $($createResp.StatusCode) $err"
}
$uploadUrl = $createResp.Headers.Location.AbsoluteUri
Write-Host "  upload URL acquired."

$fs = [System.IO.File]::OpenRead($apkPath)
try {
  $buffer = New-Object byte[] $chunkSize
  $offset = 0L
  $chunkNum = 0
  while ($offset -lt $apkSize) {
    $toRead = [int][Math]::Min($chunkSize, $apkSize - $offset)
    $read = $fs.Read($buffer, 0, $toRead)
    if ($read -le 0) { break }
    $chunk = $buffer[0..($read - 1)]

    $content = [Net.Http.ByteArrayContent]::new($chunk)
    $content.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/offset+octet-stream')

    $patchReq = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Patch, $uploadUrl)
    $patchReq.Content = $content
    $patchReq.Headers.TryAddWithoutValidation('Tus-Resumable', '1.0.0') | Out-Null
    $patchReq.Headers.TryAddWithoutValidation('Authorization', "Bearer $secretKey") | Out-Null
    $patchReq.Headers.TryAddWithoutValidation('Upload-Offset', "$offset") | Out-Null

    $patchResp = $http.SendAsync($patchReq).GetAwaiter().GetResult()
    if (-not $patchResp.IsSuccessStatusCode) {
      $err = $patchResp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      throw "TUS patch failed at offset $offset : $($patchResp.StatusCode) $err"
    }
    $offset += $read
    $chunkNum++
    $pct = [math]::Round(($offset / $apkSize) * 100, 1)
    Write-Host ("  chunk {0}: offset {1}/{2} ({3}%)" -f $chunkNum, $offset, $apkSize, $pct)
  }
} finally {
  $fs.Close()
  $fs.Dispose()
  $http.Dispose()
}
Write-Host "Upload complete."

Write-Host "--- Generate signed URL ---"
$signBody = @{ expiresIn = $expiresIn } | ConvertTo-Json -Compress
$signed = Invoke-RestMethod -Method Post `
  -Uri "$supabaseUrl/storage/v1/object/sign/$bucket/$objectName" `
  -Headers @{ Authorization = "Bearer $secretKey"; apikey = $secretKey } `
  -ContentType 'application/json' -Body $signBody
$expiresAt = (Get-Date).AddSeconds($expiresIn).ToString('u')

Write-Host ""
Write-Host "================================================"
Write-Host "  Jollify v0.5.0 demo APK ready to share"
Write-Host "  File:      $objectName ($([math]::Round($apkSize / 1MB, 2)) MB)"
Write-Host "  Expires:   $expiresAt"
Write-Host "  Download:  $supabaseUrl$($signed.signedURL)"
Write-Host "================================================"