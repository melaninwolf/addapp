# deploy.ps1 - builds web + APK, commits, and pushes to GitHub (triggers Vercel)
# Usage: .\deploy.ps1 "your commit message"
# Usage: .\deploy.ps1          (uses auto-generated message)

param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

function Step($label) {
  Write-Host "`n--- $label ---" -ForegroundColor Cyan
}

# -- 1. Build web --
Step "Building web app"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

# -- 2. Copy to Android --
Step "Copying to Android"
npx cap copy android
if ($LASTEXITCODE -ne 0) { Write-Host "Cap copy failed" -ForegroundColor Red; exit 1 }

# -- 3. Git commit + push (triggers Vercel auto-deploy) --
Step "Committing and pushing"
git add -A

$hasChanges = git status --porcelain
if ($hasChanges) {
  if (-not $Message) {
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Update $date"
  }
  git commit -m $Message
  git push origin main
  if ($LASTEXITCODE -ne 0) { Write-Host "Push failed" -ForegroundColor Red; exit 1 }
  Write-Host "Pushed - Vercel will deploy the web version automatically." -ForegroundColor Green
} else {
  Write-Host "Nothing to commit." -ForegroundColor Yellow
}

# -- 4. Build APK --
Step "Building APK"
Push-Location android
.\gradlew assembleDebug
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Host "Gradle build failed" -ForegroundColor Red
  exit 1
}
Pop-Location

# -- Done --
$apk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
  $size = [math]::Round((Get-Item $apk).Length / 1MB, 1)
  Write-Host "`nDone! APK: $apk ($size MB)" -ForegroundColor Green
} else {
  Write-Host "`nDone!" -ForegroundColor Green
}
