# Instruções dos agentes — VozFlow

Estas instruções valem para qualquer agente que trabalhe neste repositório.

## Regra principal

Trabalhe orientado pela especificação em `SPEC.md`. Antes de implementar algo novo, identifique a spec relacionada ou proponha uma atualização de spec. Não invente comportamento fora do escopo sem registrar a decisão.

## Autorização e Git

- Nunca criar commit automaticamente.
- Nunca fazer push, abrir pull request ou alterar branches sem autorização explícita.
- Ao finalizar uma tarefa, informar os arquivos alterados, validações executadas e pendências.
- Só executar `git commit` depois de o responsável dizer claramente que autoriza o commit.

## Organização do código

- UI React em `src/entries` ou `src/shared/components`.
- Integrações com Chrome e WhatsApp em `src/background` e `src/content`.
- Regras reutilizáveis em `src/shared/services`, `src/shared/hooks` e `src/shared/utils`.
- Tipos compartilhados em `src/shared/types`.
- Não misturar código de DOM, regras de negócio e apresentação no mesmo arquivo.

## Padrões obrigatórios

- TypeScript estrito e sem `any` desnecessário.
- Componentes pequenos e composáveis.
- Funções nomeadas com `export const nome = () => {}`.
- Sass com BEM, variáveis globais, mixins e nesting controlado.
- Sem estilos inline desnecessários.
- Sem lógica complexa dentro do JSX.
- Estados de carregamento, vazio, erro e sucesso devem ser previstos.

## Antes de concluir

O agente deve revisar a implementação, executar as validações disponíveis, verificar acessibilidade básica e explicar qualquer decisão que divergir da spec.
