param(
    [string]$TargetRoot = "vendor\shark-2.0",
    [string]$Tag = "v2.6.0",
    [switch]$SkipLatestCheck,
    [switch]$InstallMsys2,
    [switch]$NoBuild,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/24parida/shark-2.0.git"
$ExpectedCommit = "c9dc07d"
$NlohmannJsonUrl = "https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedTarget = Join-Path $ProjectRoot $TargetRoot
$WorkerSource = Join-Path $ProjectRoot "tools\shark_worker\shark_worker.cpp"

function Require-Command($Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Add-Msys2Path {
    $candidates = @(
        "C:\msys64",
        "$env:LOCALAPPDATA\Programs\MSYS2",
        "$env:ProgramFiles\MSYS2"
    )
    $root = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($root) {
        $env:Path = "$root\mingw64\bin;$root\usr\bin;$env:Path"
    }
    return $root
}

function Install-Msys2Dependencies($MsysRoot) {
    if (-not $MsysRoot) {
        if (-not $InstallMsys2) {
            throw "MSYS2 was not found. Install MSYS2 or rerun with -InstallMsys2."
        }
        Require-Command winget
        winget install --id MSYS2.MSYS2 --source winget --accept-package-agreements --accept-source-agreements
        $MsysRoot = Add-Msys2Path
    }
    $bash = Join-Path $MsysRoot "usr\bin\bash.exe"
    if (-not (Test-Path $bash)) {
        throw "MSYS2 bash was not found under $MsysRoot."
    }
    & $bash -lc "pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake mingw-w64-x86_64-ninja mingw-w64-x86_64-tbb mingw-w64-x86_64-fltk mingw-w64-x86_64-libpng mingw-w64-x86_64-libjpeg-turbo mingw-w64-x86_64-zlib git"
}

if (-not $SkipLatestCheck) {
    $latest = Invoke-RestMethod "https://api.github.com/repos/24parida/shark-2.0/releases/latest"
    if ($latest.tag_name -ne $Tag) {
        throw "Latest Shark release is $($latest.tag_name), but this script is pinned to $Tag. Inspect compatibility before building."
    }
}

Require-Command git

if (Test-Path $ResolvedTarget) {
    if (-not $Force) {
        throw "$ResolvedTarget already exists. Use -Force to replace it."
    }
    $resolvedProject = (Resolve-Path $ProjectRoot).Path
    $resolvedTargetParent = (Resolve-Path (Split-Path $ResolvedTarget -Parent)).Path
    if (-not $resolvedTargetParent.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a target outside the project root: $ResolvedTarget"
    }
    Remove-Item -LiteralPath $ResolvedTarget -Recurse -Force
}

New-Item -ItemType Directory -Force -Path (Split-Path $ResolvedTarget -Parent) | Out-Null
git clone --branch $Tag --depth 1 --recurse-submodules $RepoUrl $ResolvedTarget
$actualCommit = git -C $ResolvedTarget rev-parse --short HEAD
if ($actualCommit -ne $ExpectedCommit) {
    Write-Warning "Expected $Tag commit $ExpectedCommit, got $actualCommit. Continuing because the tag checkout succeeded."
}

$jsonHeader = Join-Path $ResolvedTarget "include\nlohmann\json.hpp"
New-Item -ItemType Directory -Force -Path (Split-Path $jsonHeader -Parent) | Out-Null
Invoke-WebRequest $NlohmannJsonUrl -OutFile $jsonHeader

Copy-Item -LiteralPath $WorkerSource -Destination (Join-Path $ResolvedTarget "src\shark_worker.cpp") -Force

$rangePath = Join-Path $ResolvedTarget "src\hands\PreflopRange.cpp"
$rangeText = Get-Content -Raw $rangePath
$oldRangeBlock = @'
    size_t colon_pos = trimmed.find(':');
    if (colon_pos != std::string::npos) {
      trimmed = trimmed.substr(0, colon_pos);
    }

    parse_token(trimmed, 1.0f);
'@
$newRangeBlock = @'
    float weight = 1.0f;
    size_t colon_pos = trimmed.find(':');
    if (colon_pos != std::string::npos) {
      std::string weight_text = trimmed.substr(colon_pos + 1);
      trimmed = trimmed.substr(0, colon_pos);
      try {
        weight = std::stof(weight_text);
      } catch (...) {
        weight = 1.0f;
      }
    }

    parse_token(trimmed, weight);
'@
if (-not $rangeText.Contains($newRangeBlock)) {
    if (-not $rangeText.Contains($oldRangeBlock)) {
        throw "Could not find the Shark PreflopRange weighted-token block to patch."
    }
    $rangeText = $rangeText.Replace($oldRangeBlock, $newRangeBlock)
    Set-Content -Path $rangePath -Value $rangeText -Encoding utf8
}

$cmakePath = Join-Path $ResolvedTarget "CMakeLists.txt"
$cmakeText = Get-Content -Raw $cmakePath
if (-not $cmakeText.Contains("add_executable(shark_worker")) {
    $workerTarget = @'

# Headless JSON worker for Local Poker Trainer.
add_executable(shark_worker src/shark_worker.cpp ${SOLVER_SRCS})
target_include_directories(shark_worker PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/include
)
if(APPLE)
  target_link_libraries(shark_worker PRIVATE ${TBB_STATIC_LIB} pheval)
elseif(UNIX)
  target_link_libraries(shark_worker PRIVATE ${TBB_STATIC_LIB} pheval m pthread dl)
else()
  target_link_libraries(shark_worker PRIVATE TBB::tbb pheval)
endif()
'@
    Add-Content -Path $cmakePath -Value $workerTarget -Encoding utf8
}

if ($NoBuild) {
    Write-Host "Prepared Shark worker source at $ResolvedTarget. Build skipped because -NoBuild was set."
    exit 0
}

$msysRoot = Add-Msys2Path
Install-Msys2Dependencies $msysRoot
Require-Command cmake

$buildDir = Join-Path $ResolvedTarget "build"
cmake -S $ResolvedTarget -B $buildDir -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build $buildDir --target shark_worker --config Release

$workerExe = Join-Path $buildDir "shark_worker.exe"
if (-not (Test-Path $workerExe)) {
    throw "Build finished but shark_worker.exe was not found at $workerExe"
}

Write-Host "Built Shark worker: $workerExe"
Write-Host "Use it with:"
Write-Host "`$env:POKER_TRAINER_SOLVER='shark'"
Write-Host "`$env:POKER_TRAINER_SHARK_PATH='$workerExe'"
