// print.js - Controla o disparo de impressão imediata e fechamento automático

window.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('pendingPrint', (data) => {
    if (data && data.pendingPrint) {
      const { html, paperWidth } = data.pendingPrint;
      
      // Limpa os dados de impressão do storage para evitar duplicidade
      chrome.storage.local.remove('pendingPrint');

      // Aplica o conteúdo do cupom
      const container = document.getElementById('print-content');
      if (container) {
        container.innerHTML = html;
      }
      
      // Injeta estilos específicos de bobina para a mídia de impressão
      const style = document.createElement('style');
      style.textContent = `
        html, body {
          width: ${paperWidth} !important;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.25;
          margin: 0 !important;
          padding: 0 !important;
        }
        #print-content {
          width: 100%;
          max-width: ${paperWidth};
          padding: 1mm 1mm 10mm 1mm;
          box-sizing: border-box;
        }
        @media print {
          html, body {
            width: ${paperWidth} !important;
          }
          @page {
            size: ${paperWidth} auto;
            margin: 0 !important;
          }
        }
      `;
      document.head.appendChild(style);
      
      // Fecha a popup do Chrome automaticamente assim que a impressão conclui ou é cancelada
      window.onafterprint = () => {
        window.close();
      };
      
      // Dispara a impressão imediata.
      setTimeout(() => {
        try {
          window.print();
        } catch (e) {
          console.error('Falha ao abrir diálogo de impressão', e);
          window.close();
        }
      }, 150);
    }
  });
});
