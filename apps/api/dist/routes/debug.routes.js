import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/index.js';
import { testSqlConnection, querySql } from '../services/mssql.service.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
export async function debugRoutes(app) {
    app.post('/api/debug/upload', async (req, reply) => {
        const data = await req.file();
        if (!data) {
            return reply.status(400).send({ error: 'No file uploaded' });
        }
        const filename = data.filename || 'Debug.rar';
        const filePath = path.join(UPLOADS_DIR, filename);
        await pipeline(data.file, fs.createWriteStream(filePath));
        return { success: true, filename };
    });
    app.post('/api/debug/deploy', async (req, reply) => {
        const { filename, pos_ids } = req.body;
        if (!filename)
            return reply.status(400).send({ error: 'Filename is required' });
        let posMachines = [];
        if (pos_ids === 'all') {
            posMachines = getDb().prepare('SELECT * FROM pos_machines WHERE is_active = 1').all();
        }
        else if (Array.isArray(pos_ids) && pos_ids.length > 0) {
            const placeholders = pos_ids.map(() => '?').join(',');
            posMachines = getDb().prepare(`SELECT * FROM pos_machines WHERE id IN (${placeholders})`).all(...pos_ids);
        }
        else {
            return reply.status(400).send({ error: 'No POS machines selected' });
        }
        const serverHost = req.hostname;
        const downloadUrl = `http://${serverHost}/uploads/${filename}`;
        const results = [];
        for (const pos of posMachines) {
            try {
                const test = await testSqlConnection(pos);
                if (!test.success)
                    throw new Error('Connection failed');
                await querySql(pos, `
          EXEC sp_configure 'show advanced options', 1;
          RECONFIGURE;
          EXEC sp_configure 'xp_cmdshell', 1;
          RECONFIGURE;
        `);
                const psScript = `
$ErrorActionPreference = 'Stop'
$jazzDir = ""
$drives = (Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3").DeviceID
foreach ($drive in $drives) {
    $path1 = Join-Path $drive "\\" -ChildPath "Jazz"
    $path2 = Join-Path $drive "\\" -ChildPath "jazz"
    if (Test-Path $path1) { $jazzDir = $path1; break }
    if (Test-Path $path2) { $jazzDir = $path2; break }
}
if (-not $jazzDir) { throw "Jazz folder not found on any local fixed disk" }

$rarPath = Join-Path $jazzDir "Debug.rar"
if (Test-Path $rarPath) { Remove-Item -Path $rarPath -Force }

Invoke-WebRequest -Uri "${downloadUrl}" -OutFile $rarPath -UseBasicParsing

$debugDir = Join-Path $jazzDir "Debug"
if (Test-Path $debugDir) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    Rename-Item -Path $debugDir -NewName "Debug_$timestamp" -Force
}

$winRarPath = "C:\\Program Files\\WinRAR\\WinRAR.exe"
if (-not (Test-Path $winRarPath)) {
    $winRarPath = "C:\\Program Files (x86)\\WinRAR\\WinRAR.exe"
}
if (-not (Test-Path $winRarPath)) {
    throw "WinRAR.exe not found at C:\\Program Files\\WinRAR\\"
}

$process = Start-Process -FilePath $winRarPath -ArgumentList "x -y -ibck \`"$rarPath\`" \`"$jazzDir\\\`"" -Wait -PassThru
if ($process.ExitCode -ne 0) {
    throw "WinRAR extraction failed with exit code $($process.ExitCode)"
}

$publicDesktop = "C:\\Users\\Public\\Desktop"
$shortcutName = "frontend.lnk"
$shortcutPath = Join-Path $publicDesktop $shortcutName

if (Test-Path $shortcutPath) { Remove-Item -Path $shortcutPath -Force }
$exePath = Join-Path $publicDesktop "frontend.exe"
if (Test-Path $exePath) { Remove-Item -Path $exePath -Force }

$targetExe = Join-Path $debugDir "frontend.exe"

$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $targetExe
$Shortcut.WorkingDirectory = $debugDir
$Shortcut.Save()

Write-Output "SUCCESS"
`;
                const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
                const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`;
                const rows = await querySql(pos, `
          DECLARE @cmd VARCHAR(8000) = '${cmd}';
          CREATE TABLE #Output (Line NVARCHAR(MAX));
          INSERT INTO #Output EXEC xp_cmdshell @cmd;
          SELECT Line FROM #Output WHERE Line IS NOT NULL;
          DROP TABLE #Output;
        `);
                let errorOutput = '';
                for (const row of rows) {
                    const line = String(row.Line);
                    if (line.includes('throw') || line.includes('CategoryInfo') || line.includes('Exception') || line.includes('failed')) {
                        errorOutput += line + ' ';
                    }
                }
                if (errorOutput) {
                    throw new Error(errorOutput.trim());
                }
                results.push({ pos_id: pos.id, pos_name: pos.name, success: true });
            }
            catch (err) {
                results.push({
                    pos_id: pos.id,
                    pos_name: pos.name,
                    success: false,
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }
        return { results };
    });
}
