/**
 * Script de teste direto do Print Agent sem necessidade de compilação ou TypeScript
 * Compatível diretamente com o Node.js no Windows
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

console.log('[PRINT AGENT] Iniciando teste direto...');

// Carrega config.json
const configPath = path.join(__dirname, 'config.json');
let printerName = 'EPSON TM-T20X Receipt';
let paperWidth = 48;

try {
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (cfg.printerName) printerName = cfg.printerName;
    if (cfg.paperWidth) paperWidth = cfg.paperWidth;
  }
} catch (e) {
  console.log('[PRINT AGENT] Usando configuração padrão.');
}

console.log(`[PRINT AGENT] Impressora configurada: "${printerName}"`);
console.log(`[PRINT AGENT] Largura: ${paperWidth} colunas`);

// Monta buffer ESC/POS simples
const ESC = '\x1B';
const GS = '\x1D';

let ticket = '';
ticket += `${ESC}@`; // Reset
ticket += `${ESC}a\x01`; // Centralizar
ticket += '================================================\n';
ticket += `${GS}!\x11`; // Letra dupla
ticket += 'UMAI SUSHI\n';
ticket += `${GS}!\x00`; // Letra normal
ticket += `${ESC}E\x01`; // Negrito on
ticket += 'TESTE DE IMPRESSAO FISICA\n';
ticket += 'PRINT AGENT WINDOWS\n';
ticket += `${ESC}E\x00`; // Negrito off
ticket += '================================================\n';
ticket += `${ESC}a\x00`; // Esquerda
ticket += `Data/Hora:  ${new Date().toLocaleString('pt-BR')}\n`;
ticket += `Impressora: ${printerName}\n`;
ticket += `Canal:      Windows Spooler (RAW ESC/POS)\n`;
ticket += '------------------------------------------------\n';
ticket += `${ESC}a\x01`;
ticket += 'TESTE DE TRANSMISSAO FISICA RAW\n';
ticket += 'Se este papel imprimiu e cortou,\n';
ticket += 'o teste fisico esta APROVADO!\n';
ticket += '================================================\n';
ticket += `${ESC}d\x04`; // Avanca 4 linhas
ticket += `${GS}V\x42\x00`; // Corte parcial

const buffer = Buffer.from(ticket, 'binary');

if (process.platform !== 'win32') {
  console.log(`[PRINT AGENT] Ambiente atual (${process.platform}) não é Windows.`);
  console.log(`[PRINT AGENT] Simulação gerou ${buffer.length} bytes com sucesso.`);
  console.log(`[PRINT AGENT] Para testar fisicamente, execute este arquivo no Windows.`);
  process.exit(0);
}

// Grava arquivo temporário com os bytes
const tempFile = path.join(os.tmpdir(), `umai_test_${Date.now()}.bin`);
fs.writeFileSync(tempFile, buffer);

const rawSpoolerExe = path.join(__dirname, 'raw_spooler.exe');
const rawSpoolerCs = path.join(__dirname, 'raw_spooler.cs');

if (!fs.existsSync(rawSpoolerExe) && fs.existsSync(rawSpoolerCs)) {
  console.log('[PRINT AGENT] Compilando raw_spooler.exe com csc.exe...');
  const { execSync } = require('child_process');
  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    'csc.exe'
  ];
  let compiled = false;
  for (const csc of cscCandidates) {
    try {
      if (csc !== 'csc.exe' && !fs.existsSync(csc)) continue;
      execSync(`"${csc}" /nologo /optimize+ /target:exe /out:"${rawSpoolerExe}" "${rawSpoolerCs}"`, { stdio: 'inherit' });
      if (fs.existsSync(rawSpoolerExe)) {
        compiled = true;
        break;
      }
    } catch (e) {
      console.error('[ERRO COMPILACAO]', e.message);
    }
  }
  if (!compiled) {
    console.error('\n[BLOQUEIO] Falha ao compilar raw_spooler.exe. O fallback do PowerShell foi desativado por estabilidade.');
    process.exit(1);
  }
}

if (!fs.existsSync(rawSpoolerExe)) {
  console.error('\n[BLOQUEIO] Executavel raw_spooler.exe nao encontrado! Compile com csc.exe antes de testar.');
  process.exit(1);
}

console.log(`[PRINT AGENT] Enviando ${buffer.length} bytes para o Windows Spooler via raw_spooler.exe...`);

execFile(rawSpoolerExe, [printerName, tempFile], { timeout: 10000 }, (err, stdout, stderr) => {
  try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
  if (err) {
    console.error('[PRINT AGENT] [ERRO]', err.message, stderr || '');
    process.exit(1);
  }
  const output = (stdout || '').trim();
  console.log('[PRINT AGENT] Retorno do Spooler:', output);
  if (output.includes('RESULT_CODE:0')) {
    console.log('\n======================================================');
    console.log(' [OK] TRABALHO ENVIADO COM SUCESSO AO SPOOLER!');
    console.log(' Verifique a saida fisica de papel na Epson TM-T20X.');
    console.log('======================================================\n');
  } else if (output.includes('RESULT_CODE:1801')) {
    console.error('\n[ERRO] Nome da impressora nao confere no Windows!');
    console.error(`O nome "${printerName}" nao foi encontrado no Spooler.`);
    console.error('Verifique o nome correto listado na tela anterior e ajuste o config.json.\n');
  } else {
    console.error('\n[ERRO] Codigo retornado pelo Spooler:', output);
  }
});
