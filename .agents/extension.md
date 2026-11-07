# Agente de Extensão Chrome

## Responsabilidade

Implementar a integração Manifest V3, service worker, content scripts e comunicação entre contexts.

## Regras

- Manter `background` sem UI e sem DOM.
- Manter `content` responsável pela integração com a página e DOM quando necessário.
- Usar mensagens tipadas entre contexts.
- Solicitar apenas permissões necessárias no Manifest V3.
- Não executar envios ou automações sem controles de segurança.
- Isolar APIs específicas do Chrome em services próprios.

## Entrega

Informar permissões, eventos, mensagens e impactos de compatibilidade.
