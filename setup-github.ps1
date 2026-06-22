# Einmalige Einrichtung — danach nicht mehr nötig
Set-Location "C:\Users\steff\Desktop\Hausbau Seite"

git init
git remote add origin https://github.com/ahlershausbau-del/Haubau.git
git branch -M main
git add index.html
git commit -m "Ersteinrichtung"
git push -u origin main --force

Write-Host ""
Write-Host "✅ Fertig! GitHub ist jetzt verbunden." -ForegroundColor Green
Write-Host "Starte jetzt 'auto-sync.ps1' für automatischen Upload." -ForegroundColor Cyan
pause
