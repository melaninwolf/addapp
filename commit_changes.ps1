Set-Location "C:\Users\marak\Documents\addapp"
if (Test-Path ".git\index.lock") { Remove-Item ".git\index.lock" -Force }
git add src/pages/BrainDump.jsx src/pages/BrainDump.css src/pages/ProjectDetail.jsx src/pages/Calendar.jsx src/pages/Journal.jsx src/pages/Journal.css
git commit -m "feat: pen mode for brain dump, collapsible journal calendar, gcal fix on native, milestone tasks"
git push
Write-Host "Done!" -ForegroundColor Green
