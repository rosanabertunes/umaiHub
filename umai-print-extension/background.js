// background.js - Service worker para gerenciar a janela de impressão

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'instant-print') {
    // Grava temporariamente o conteúdo do cupom no storage local para que a página de impressão o acesse
    chrome.storage.local.set({
      pendingPrint: {
        html: request.html,
        paperWidth: request.paperWidth
      }
    }, () => {
      // Abre uma janela popup limpa contendo o print.html
      chrome.windows.create({
        url: chrome.runtime.getURL('print.html'),
        type: 'popup',
        width: 440,
        height: 600,
        focused: true
      });
    });
  }
});
