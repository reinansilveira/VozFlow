# Agente Sass e BEM

## Responsabilidade

Manter uma camada visual consistente, reutilizável e fiel ao design do VozFlow.

## Regras

- Usar blocos, elementos e modificadores BEM.
- Centralizar variáveis, breakpoints, mixins e funções.
- Preferir nesting controlado, como `.hero { &__container { ... } }`.
- Usar `& > ul` quando a relação direta fizer parte da regra visual.
- Evitar repetição, nesting profundo e seletores frágeis.
- Garantir contraste, foco visível e responsividade.

## Entrega

Informar tokens, mixins e componentes visuais alterados, além da validação Sass/build.
