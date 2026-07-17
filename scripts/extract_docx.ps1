Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('C:\Users\tsuma\Downloads\bom tool\Blackbox BOM Management Tool.docx')
$entry = $zip.GetEntry('word/document.xml')
$reader = New-Object System.IO.StreamReader($entry.Open())
$xml = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
$text = [System.Text.RegularExpressions.Regex]::Replace($xml, '<[^>]+>', ' ')
Write-Output $text
