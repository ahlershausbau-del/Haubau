# ============================================================
#  Hausbau Seite - Start & Auto-Sync
#  Funktioniert auf JEDEM Geraet (Laptop + PC zuhause).
#  Einfach doppelklicken zum Starten.
# ============================================================

# In den Ordner wechseln, in dem dieses Skript liegt
Set-Location $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Hausbau Seite - Sync gestartet" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Neuesten Stand von GitHub holen -------------------
Write-Host "Hole neuesten Stand von GitHub..." -ForegroundColor Yellow
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ACHTUNG: Konnte nicht herunterladen." -ForegroundColor Red
    Write-Host "Vielleicht gibt es einen Konflikt oder kein Internet." -ForegroundColor Red
    Write-Host "Bitte pruefen, bevor du weiterarbeitest!" -ForegroundColor Red
    Write-Host ""
    pause
    exit
}
Write-Host "Stand ist aktuell." -ForegroundColor Green
Write-Host ""
Write-Host "Du kannst jetzt arbeiten. Aenderungen werden automatisch hochgeladen." -ForegroundColor Gray
Write-Host "Fenster offen lassen. Zum Beenden: Fenster schliessen oder Strg+C." -ForegroundColor Gray
Write-Host ""

# Hilfsfunktion: alle Aenderungen hochladen
function Sync-Upload {
    $status = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($status)) { return }  # nichts geaendert

    $now = [DateTime]::Now
    Write-Host ("Aenderung erkannt um " + $now.ToString("HH:mm:ss") + " - lade hoch...") -ForegroundColor Yellow

    git add -A
    git commit -m ("Update " + $now.ToString("dd.MM.yyyy HH:mm:ss")) | Out-Null
    git push
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Hochgeladen. Seite wird in ~1 Min aktualisiert." -ForegroundColor Green
    } else {
        Write-Host "Fehler beim Upload - bitte manuell pruefen." -ForegroundColor Red
    }
    Write-Host ""
}

# --- 2. Ueberwachen & automatisch hochladen ---------------
try {
    $lastChange = [DateTime]::MinValue
    $pendingFrom = [DateTime]::MinValue

    while ($true) {
        Start-Sleep -Seconds 2

        $hasChanges = -not [string]::IsNullOrWhiteSpace((git status --porcelain))

        if ($hasChanges) {
            if ($pendingFrom -eq [DateTime]::MinValue) {
                $pendingFrom = [DateTime]::Now
            }
            # 5 Sekunden Ruhe abwarten, damit nicht mitten im Speichern hochgeladen wird
            if (([DateTime]::Now - $pendingFrom).TotalSeconds -ge 5) {
                Sync-Upload
                $pendingFrom = [DateTime]::MinValue
            }
        } else {
            $pendingFrom = [DateTime]::MinValue
        }
    }
}
finally {
    # --- 3. Beim Schliessen: finaler Upload ---------------
    Write-Host ""
    Write-Host "Beende - lade letzte Aenderungen hoch..." -ForegroundColor Cyan
    Sync-Upload
    Write-Host "Fertig. Bis zum naechsten Mal!" -ForegroundColor Green
}
