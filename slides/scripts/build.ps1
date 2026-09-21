# PPT 빌드 스크립트
#
# 설치된 도구를 찾아 가장 알맞은 방법을 안내합니다.
# 아무 도구도 없으면 그대로 안내만 하고 끝납니다.
#
# 사용법:  cd slides ; .\scripts\build.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'output'

New-Item -ItemType Directory -Force -Path $out | Out-Null

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

$found = @()

if (Test-Cmd 'npx') {
    $found += 'npx  → Marp:  npx @marp-team/marp-cli src/*.md -o output/slides.pptx'
    $found += '        Marp:  npx @marp-team/marp-cli src/*.md -o output/slides.pdf'
    $found += '        reveal.js: npx reveal-md src --static output/html'
}

if (Test-Cmd 'python') {
    $found += 'python → python-pptx:  python scripts/build_pptx.py'
    $found += '         pandoc(pptx): python -m pip install pypandoc && pandoc src/*.md -o output/slides.pptx'
}

if (Test-Cmd 'pandoc') {
    $found += 'pandoc → pandoc src/02-agenda.md ... -o output/slides.pptx'
}

if (Test-Cmd 'libreoffice') {
    $found += 'libreoffice → .pptx 를 PDF로 변환: soffice --headless --convert-to pdf --outdir output output/slides.pptx'
}

if ($found.Count -eq 0) {
    Write-Host '사용 가능한 빌드 도구를 찾지 못했습니다.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '가장 빠른 시작 방법:' -ForegroundColor Cyan
    Write-Host '  1) Node.js 설치 후:  npx @marp-team/marp-cli src/03-content.md -o output/slides.pdf'
    Write-Host '  2) 또는 PowerPoint에서 src/ 내용을 직접 옮겨 적기'
    Write-Host '  3) 또는 pandoc 설치 후 Markdown → pptx 변환'
} else {
    Write-Host '사용 가능한 빌드 도구:' -ForegroundColor Cyan
    $found | ForEach-Object { Write-Host "  - $_" }
}

Write-Host ''
Write-Host "출력 폴더: $out" -ForegroundColor DarkGray
