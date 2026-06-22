Set-Location "C:\Users\steff\Desktop\Hausbau Seite"

Write-Host "Auto-Sync gestartet - ueberwacht index.html" -ForegroundColor Cyan
Write-Host "Fenster offen lassen. Strg+C zum Beenden." -ForegroundColor Gray
Write-Host ""

$lastWrite = (Get-Item "index.html").LastWriteTime
$lastUpload = [DateTime]::MinValue

while ($true) {
    Start-Sleep -Seconds 2

    $currentWrite = (Get-Item "index.html").LastWriteTime

    if ($currentWrite -ne $lastWrite) {
        $lastWrite = $currentWrite
        $now = [DateTime]::Now

        if (($now - $lastUpload).TotalSeconds -gt 5) {
            $lastUpload = $now

            Write-Host ("Aenderung erkannt um " + $now.ToString("HH:mm:ss") + " - lade hoch...") -ForegroundColor Yellow

            git add index.html
            git commit -m ("Update " + $now.ToString("dd.MM.yyyy HH:mm:ss"))
            git push

            if ($LASTEXITCODE -eq 0) {
                Write-Host ("Fertig! Seite wird in ~1 Min aktualisiert.") -ForegroundColor Green
            } else {
                Write-Host "Fehler beim Upload - bitte manuell pruefen." -ForegroundColor Red
            }

            Write-Host ""
        }
    }
}
