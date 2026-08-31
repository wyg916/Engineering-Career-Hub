param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$KnowledgeRoot
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $KnowledgeRoot).Path
$visibleRoots = @(
  '01_原始经验卡片',
  '02_项目经历索引',
  '04_面试知识库',
  '05_阶段复盘',
  '06_待学习知识'
)

$records = foreach ($directory in $visibleRoots) {
  $candidate = Join-Path $resolvedRoot $directory
  if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { continue }
  Get-ChildItem -LiteralPath $candidate -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($resolvedRoot.Length).TrimStart('\').Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$relative`t$hash"
  }
}

$manifest = ($records | Sort-Object) -join "`n"
$bytes = [Text.Encoding]::UTF8.GetBytes($manifest)
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $digest = [Convert]::ToHexString($sha.ComputeHash($bytes)).ToLowerInvariant()
} finally {
  $sha.Dispose()
}

[PSCustomObject]@{
  knowledgeRoot = $resolvedRoot
  fileCount = @($records).Count
  sha256 = $digest
} | ConvertTo-Json
