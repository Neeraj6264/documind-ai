param (
    [Parameter(Mandatory=$true)]
    [string]$RepoUrl
)

Write-Host "Configuring Git remote to: $RepoUrl" -ForegroundColor Cyan

# Check if remote origin already exists
$existingRemote = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Updating existing origin remote..." -ForegroundColor Yellow
    git remote set-url origin $RepoUrl
} else {
    Write-Host "Adding new origin remote..." -ForegroundColor Green
    git remote add origin $RepoUrl
}

Write-Host "Pushing main branch to GitHub..." -ForegroundColor Cyan
git branch -M main
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Successfully uploaded project to GitHub: $RepoUrl" -ForegroundColor Green
} else {
    Write-Host "`n✗ Failed to push to GitHub. Please check your repository URL and Git authentication." -ForegroundColor Red
}
