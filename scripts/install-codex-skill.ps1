[CmdletBinding()]
param(
    [string]$DestinationRoot,
    [string]$Repository = 'lusy37/schedule-assistant',
    [string]$Ref = 'main',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$skillName = 'schedule-assistant'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localSource = Join-Path $repositoryRoot "skills\$skillName"

if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $codexRoot = if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
        $env:CODEX_HOME
    } else {
        Join-Path $env:USERPROFILE '.codex'
    }
    $DestinationRoot = Join-Path $codexRoot 'skills'
}

$destination = [System.IO.Path]::GetFullPath((Join-Path $DestinationRoot $skillName))
if ((Test-Path -LiteralPath $destination) -and -not $Force) {
    throw "Skill 已存在：$destination。确认覆盖时请添加 -Force。"
}

$temporaryRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ("schedule-assistant-skill-" + [guid]::NewGuid().ToString('N'))))
$stagedSkill = Join-Path $temporaryRoot $skillName

try {
    New-Item -ItemType Directory -Path (Join-Path $stagedSkill 'agents') -Force | Out-Null
    $files = @('SKILL.md', 'agents/openai.yaml')
    foreach ($relativePath in $files) {
        $stagedFile = Join-Path $stagedSkill $relativePath
        if (Test-Path -LiteralPath $localSource) {
            Copy-Item -LiteralPath (Join-Path $localSource $relativePath) -Destination $stagedFile
        } else {
            $urlPath = $relativePath.Replace('\', '/')
            $url = "https://raw.githubusercontent.com/$Repository/$Ref/skills/$skillName/$urlPath"
            Invoke-WebRequest -Uri $url -OutFile $stagedFile -UseBasicParsing
        }
    }

    New-Item -ItemType Directory -Path (Join-Path $destination 'agents') -Force | Out-Null
    foreach ($relativePath in $files) {
        Copy-Item -LiteralPath (Join-Path $stagedSkill $relativePath) -Destination (Join-Path $destination $relativePath) -Force
    }
    Write-Output "已安装 Codex Skill：$destination"
    Write-Output '该脚本只安装 Skill，不会下载第二个 EXE。'
} finally {
    $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($temporaryRoot.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
