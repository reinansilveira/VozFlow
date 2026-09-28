# Voz Pronta para WhatsApp

Extensão Manifest V3 para Chrome e Edge com bibliotecas persistentes de áudios e imagens, envio instantâneo na conversa aberta e funis temporizados com áudio, imagem e texto.

## Instalação local

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension` deste projeto.
5. Abra ou recarregue `https://web.whatsapp.com`.

## Uso

1. Abra a conversa desejada no WhatsApp Web.
2. Clique no botão verde **Voz Pronta** no canto inferior direito.
3. Adicione um arquivo, dê um nome e aguarde a conversão para OGG/Opus.
4. Use **Enviar** em qualquer áudio salvo para mandar na conversa aberta.
5. Em **Imagens**, salve imagens nomeadas e envie-as na conversa aberta.
6. Em **Funis**, combine áudios, imagens e textos. Áudios mostram “gravando áudio…” e imagens/textos mostram “digitando…” durante a espera.

Os áudios são convertidos localmente para OGG/Opus e ficam salvos no armazenamento da extensão, persistindo após atualizar a página. Nenhum arquivo é enviado a servidores da extensão.

É possível iniciar um funil em uma conversa, trocar para outra conversa e iniciar outro. Os processos seguem simultaneamente e ficam visíveis na aba **Atividade**.

## Limitações

- Mudanças na interface do WhatsApp Web podem exigir atualização dos seletores dos botões.
- Formatos efetivamente decodificáveis dependem dos codecs presentes no Chrome/Edge e no sistema operacional.
- Funis ativos são interrompidos se a aba do WhatsApp for fechada ou recarregada.
- Use somente com destinatários que autorizaram o contato.

## Desenvolvimento

A extensão inclui localmente o WA-JS 4.6.0 (Apache-2.0) e o encoder do opus-recorder 8.0.5 (MIT). O codificador é executado diretamente na página isolada da extensão, sem worker e sem código remoto. Para testar alterações, use o botão de recarregar da extensão e depois recarregue o WhatsApp Web.

O manifesto libera `wasm-unsafe-eval` exclusivamente para executar o codificador WebAssembly incluído no próprio pacote; nenhuma origem externa é permitida pela política de segurança.
