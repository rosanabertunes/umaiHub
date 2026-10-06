param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

$csFile = Join-Path $PSScriptRoot "raw_spooler.cs"
if (-not (Test-Path $csFile)) {
    Write-Output "RESULT_CODE:404_CS_NOT_FOUND"
    exit
}

$source = [System.IO.File]::ReadAllText($csFile)

try {
    Add-Type -TypeDefinition $source -Language CSharp
} catch {
    # Ja pode estar carregado na sessao
}

try {
    $result = [WinSpoolRaw]::SendRawFile($PrinterName, $FilePath)
    Write-Output "RESULT_CODE:$result"
} catch {
    Write-Output "RESULT_CODE:EXCEPTION_$($_.Exception.Message)"
}
