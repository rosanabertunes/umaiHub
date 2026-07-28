// content.js - Intercepta eventos de impressão e realiza a impressão direta no documento principal
// Projetado especificamente para eliminar abas intermediárias e focar na bobina Epson TM-T20 de 80mm.

// 1. Injeta a tag global sincronamente para que o App React detecte a extensão instantaneamente
try {
  const injectScript = () => {
    const script = document.createElement('script');
    script.textContent = 'window.__umaiPrintExtensionActive = true;';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  };
  injectScript();
} catch (e) {
  console.warn('Umai Print Extension: Erro ao injetar flag global', e);
}

// 2. Escuta solicitações de impressão enviadas pelo App React
window.addEventListener('chrome-instant-print', (event) => {
  const { html, paperWidth } = event.detail;
  
  // Cria e injeta o executor de impressão diretamente na página ativa (fora do sandbox do iframe)
  const script = document.createElement('script');
  script.textContent = `
    (() => {
      // 1. Limpa resíduos de impressões anteriores
      document.getElementById('print-receipt-section')?.remove();
      document.getElementById('print-receipt-styles')?.remove();

      // 2. Cria o container temporário de impressão (perfeito para bobina Epson TM-T20 de 80mm)
      const printSection = document.createElement('div');
      printSection.id = 'print-receipt-section';
      printSection.innerHTML = \`
        <div style="width: 72mm; margin: 0 auto; padding: 0 1mm 5mm 1mm; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; background: white; color: black; font-size: 11px; line-height: 1.25;">
          \${${JSON.stringify(html)}}
        </div>
      \`;
      document.body.appendChild(printSection);

      // 3. Injeta regras CSS ultra-precisas para focar no papel de bobina de 80mm
      const styleTag = document.createElement('style');
      styleTag.id = 'print-receipt-styles';
      styleTag.innerHTML = \`
        @media print {
          body > *:not(#print-receipt-section) {
            display: none !important;
          }
          #root, iframe, .aistudio-sidebar {
            display: none !important;
          }
          html, body {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          #print-receipt-section {
            display: block !important;
            position: absolute !important;
            left: 0;
            top: 0;
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: 80mm auto; /* Força a bobina a cortar exatamente no fim do conteúdo */
            margin: 0 !important;
          }
        }
      \`;
      document.head.appendChild(styleTag);

      // 4. Executa a impressão imediata sem páginas extras
      try {
        window.print();
      } catch (err) {
        console.error('Erro de impressão instantânea:', err);
      } finally {
        // Limpa os elementos temporários após o fechamento do diálogo de impressão
        setTimeout(() => {
          document.getElementById('print-receipt-section')?.remove();
          document.getElementById('print-receipt-styles')?.remove();
        }, 1000);
      }
    })();
  `;
  document.body.appendChild(script);
  script.remove();
});

// 3. Responde a testes periódicos do App React para reconfirmar atividade
window.addEventListener('check-print-extension', () => {
  window.dispatchEvent(new CustomEvent('print-extension-active'));
});
