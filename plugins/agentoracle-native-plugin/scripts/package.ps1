# Windows PowerShell 打包脚本
# 用于将插件打包为 Claw-Hub 发布格式

# 获取版本号
$version = node -p "require('./package.json').version"
$packageName = "agentoracle-native-plugin-v$version.tar.gz"

Write-Host "打包版本: $version" -ForegroundColor Green
Write-Host "包名称: $packageName" -ForegroundColor Green

# 检查必需的文件和目录
$requiredItems = @("dist", "node_modules", "src", "package.json", "package-lock.json", "openclaw.plugin.json", "README.md", "LICENSE", "tsconfig.json")
$missing = @()

foreach ($item in $requiredItems) {
    if (-not (Test-Path $item)) {
        $missing += $item
    }
}

if ($missing.Count -gt 0) {
    Write-Host "错误: 缺少必需的文件或目录:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "`n请确保已运行 'npm install' 和 'npm run build'" -ForegroundColor Yellow
    exit 1
}

# 打包（单行命令，避免 PowerShell 多行问题）
Write-Host "`n开始打包..." -ForegroundColor Cyan

# OpenClaw 要求打包文件有顶层目录
# 创建临时目录结构
$tempDir = "temp-package"
$pluginDir = "$tempDir/agentoracle-native"

Write-Host "创建临时目录结构..." -ForegroundColor Cyan

# 清理旧的临时目录
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}

# 创建目录
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null

# 复制文件到临时目录
$includeItems = @(
    "src"
    "index.ts"
    "package.json"
    "package-lock.json"
    "openclaw.plugin.json"
    "README.md"
    "LICENSE"
    "tsconfig.json"
    "node_modules"
)

Write-Host "复制文件到临时目录..." -ForegroundColor Cyan
foreach ($item in $includeItems) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination $pluginDir -Recurse -Force
        Write-Host "  ✓ $item" -ForegroundColor Gray
    }
}

# 从临时目录打包
Write-Host "创建 tar.gz 文件..." -ForegroundColor Cyan

$excludeArgs = @(
    "--exclude=src/__tests__"
    "--exclude=coverage"
    "--exclude=*.log"
)

# 使用 -C 参数切换到 temp-package 目录，这样打包的顶层目录就是 agentoracle-native
$tarArgs = @("-czf", $packageName, "-C", $tempDir) + $excludeArgs + @("agentoracle-native")

# 执行 tar 命令，捕获错误
try {
    & tar $tarArgs 2>&1 | ForEach-Object {
        if ($_ -match "Couldn't visit directory") {
            # 忽略无法访问的目录警告（通常是系统目录）
            Write-Host "警告: $_" -ForegroundColor Yellow
        } elseif ($_ -match "Error") {
            Write-Host "错误: $_" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "tar 命令执行失败: $_" -ForegroundColor Red
    # 清理临时目录
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}

# 清理临时目录
Write-Host "清理临时文件..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ 打包成功!" -ForegroundColor Green
    
    # 显示文件信息
    $fileInfo = Get-Item $packageName
    $sizeInMB = [math]::Round($fileInfo.Length / 1MB, 2)
    
    Write-Host "`n文件信息:" -ForegroundColor Cyan
    Write-Host "  名称: $packageName"
    Write-Host "  大小: $sizeInMB MB"
    Write-Host "  路径: $($fileInfo.FullName)"
    
    # 显示打包内容统计
    Write-Host "`n打包内容统计:" -ForegroundColor Cyan
    $fileCount = (tar -tzf $packageName | Measure-Object).Count
    Write-Host "  文件数量: $fileCount"
    
    Write-Host "`n下一步:" -ForegroundColor Yellow
    Write-Host "  1. 登录 Claw-Hub: openclaw hub login"
    Write-Host "  2. 发布插件: openclaw hub publish $packageName"
} else {
    Write-Host "`n✗ 打包失败!" -ForegroundColor Red
    Write-Host "错误代码: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
