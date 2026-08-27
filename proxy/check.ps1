<#
.SYNOPSIS
  Checks a deployed Ḥāshiya proxy end to end, before wiring PROXY_URL into the build.

.DESCRIPTION
  worker.js is verified locally against a stubbed upstream by `npm run verify`.
  What that cannot tell you is whether the real services answer *Cloudflare*.
  shamela.ws and dorar.net both treat unfamiliar clients differently, and
  dorar 403s aggressively — so a Worker that is perfectly correct can still be
  refused by the upstream. This finds that out here rather than from a failed
  import on the tablet.

  Output is deliberately ASCII markers rather than Arabic, because Windows
  PowerShell 5.1 mangles UTF-8 response bodies on display and a mangled title
  tells you nothing.

.EXAMPLE
  .\check.ps1 -WorkerUrl https://hashiya-proxy.abc123.workers.dev
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $WorkerUrl,

  # Must match ALLOWED_ORIGINS in wrangler.toml. Scheme + host, no path.
  [string] $Origin = 'https://khacha329.github.io'
)

$W = $WorkerUrl.TrimEnd('/')
$pass = 0
$fail = 0

function Report($label, $ok, $detail) {
  if ($ok) { $script:pass++; Write-Host "  ok    $label $detail" }
  else { $script:fail++; Write-Host "  FAIL  $label $detail" -ForegroundColor Red }
}

# PS 5.1 throws on any non-2xx, so the status code has to be dug out of the
# exception. Returns a status/body pair either way.
function Fetch($path, $withOrigin = $Origin) {
  $headers = @{}
  if ($withOrigin) { $headers['Origin'] = $withOrigin }
  try {
    $r = Invoke-WebRequest -Uri "$W$path" -Headers $headers -UseBasicParsing -TimeoutSec 30
    return @{ status = [int]$r.StatusCode; body = $r.Content }
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      return @{ status = [int]$response.StatusCode; body = $reader.ReadToEnd() }
    }
    return @{ status = 0; body = $_.Exception.Message }
  }
}

Write-Host "`nChecking $W`n"

Write-Host '=== shamela.ws ==='
# 9260 is a real book (Sharḥ Riyāḍ aṣ-Ṣāliḥīn) and is in the catalog. Note that
# a nonexistent id still returns 200 with a generic page, which is exactly why
# this looks for a book-page marker and not merely for HTML.
$r = Fetch '/shamela/book/9260'
Report 'answers 200' ($r.status -eq 200) "(got $($r.status))"
Report 'body is a real book page, not the generic shell' ($r.body -match 'betaka-index') '(betaka-index marker)'
Report 'carries an author link' ($r.body -match '/author/') ''
Report 'is a full page' ($r.body.Length -gt 40000) "($($r.body.Length) bytes, a real one is ~76,000)"

Write-Host "`n=== dorar.net (the one most likely to refuse a datacentre IP) ==="
# innamā al-aʿmāl bi-l-niyyāt — the most-cited hadith there is.
$q = '%D8%A5%D9%86%D9%85%D8%A7%20%D8%A7%D9%84%D8%A3%D8%B9%D9%85%D8%A7%D9%84%20%D8%A8%D8%A7%D9%84%D9%86%D9%8A%D8%A7%D8%AA'
$r = Fetch "/dorar/dorar_api.json?skey=$q"
Report 'answers 200' ($r.status -eq 200) "(got $($r.status))"
Report 'returned JSON, not an HTML block page' ($r.body.TrimStart().StartsWith('{')) ''
Report 'the payload has records' ($r.body -match 'ahadith') ''

Write-Host "`n=== api.quran.com ==="
$r = Fetch '/quran-api/api/v4/verses/by_key/2:255?fields=text_uthmani'
Report 'answers 200' ($r.status -eq 200) "(got $($r.status))"
Report 'returned a verse' ($r.body -match 'text_uthmani') ''

Write-Host "`n=== the guards ==="
$r = Fetch '/shamela/book/9260' 'https://evil.example'
Report 'an unlisted origin is refused' ($r.status -eq 403) "(got $($r.status))"
$r = Fetch '/sunnah/v1/collections'
Report 'sunnah is off, so no API key can transit' ($r.status -eq 404) "(got $($r.status))"
$r = Fetch '/nope/x'
Report 'an unlisted host is refused' ($r.status -eq 404) "(got $($r.status))"

if ($fail -eq 0) {
  Write-Host "`nPASS - $pass/$pass checks passed." -ForegroundColor Green
  Write-Host "Set the PROXY_URL repository variable to $W and re-run the deploy workflow.`n"
} else {
  Write-Host "`nFAIL - $fail of $($pass + $fail) checks failed.`n" -ForegroundColor Red
  exit 1
}
