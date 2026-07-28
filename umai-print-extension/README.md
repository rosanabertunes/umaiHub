# Umai Sushi - Extensor de Impressão Direta do Google Chrome 🔌

Este extensor (extensão do navegador) foi projetado especificamente como solução oficial para o **Umai Sushi** rodando sob o ambiente de sandbox do Google AI Studio (`studio.ai`). 

Ele contorna todas as restrições de segurança de iframes sandboxed impostas pelo navegador, permitindo a **impressão imediata e sem atrito de cupons térmicos (bobinas de 80mm ou 58mm)**, disparando o diálogo nativo do Chrome diretamente em segundo plano e fechando a janela de impressão automaticamente.

---

## 🚀 Como Instalar no seu Google Chrome (Passo a Passo)

Siga os passos rápidos abaixo para ativar a impressão em menos de 1 minuto:

1. **Baixe ou Copie os Arquivos:**
   - Se baixou o projeto completo como `.ZIP`, extraia a pasta `umai-print-extension`.
   - Ou clique no botão **"Baixar Extensor Umai (.zip)"** diretamente na aba de impressão do sistema para baixar um zip prontinho!

2. **Abra a página de Extensões do Chrome:**
   - No Google Chrome, digite na barra de endereços: `chrome://extensions` e aperte Enter.

3. **Ative o "Modo do Desenvolvedor":**
   - No canto superior direito da tela de extensões, **ative a chave** que diz **"Modo do desenvolvedor"** (Developer Mode).

4. **Carregue o Extensor:**
   - No canto superior esquerdo, clique no botão **"Carregar sem compactação"** (Load unpacked).
   - Selecione a pasta `umai-print-extension` (aquela que contém o arquivo `manifest.json` e os scripts) e clique em Confirmar.

5. **Pronto! 🎉**
   - O extensor **"Umai Sushi - Extensor de Impressão Direta"** aparecerá ativo na sua lista.
   - Volte ao sistema do Umai Sushi e atualize a página. Você notará um indicador **"🔌 Extensor Chrome: Ativo"** verde piscando no painel auxiliar e todos os seus cupons serão impressos instantaneamente de forma 100% direta ao clicar nos botões de impressão!

---

## 🛠️ Como funciona por trás das câmeras?
1. O App React do **Umai Sushi** detecta a presença da extensão de forma assíncrona por meio de flags e eventos customizados na janela (`window`).
2. Quando você clica em imprimir uma mesa ou cupom, o React dispara um evento customizado contendo o HTML e as dimensões da bobina.
3. A extensão captura esse evento (mesmo rodando dentro de um iframe protegido), abre uma janela secundária temporária, injeta os estilos otimizados para bobinas térmicas (Epson TM-T20X), chama a instrução nativa de impressão imediata e se auto-destrói em milissegundos.
