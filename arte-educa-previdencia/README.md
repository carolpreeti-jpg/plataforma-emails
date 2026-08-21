# Réplica da arte "Educa Previdência BRB"

Três arquivos, entregues em partes como pedido:

- **`parte1-cabecalho.html`** — a faixa azul do topo + selo com a moedinha e a marca ("Educa" / "Previdência BRB"). Abra direto no navegador pra conferir.
- **`parte2-conteudo.html`** — a foto com o título sobreposto, o texto de corpo, a pergunta em negrito e a faixa azul final com o botão "Acessar trilha". Também abre direto no navegador.
- **`arte-completa-template.html`** — as duas partes juntas, já com variáveis `{{ }}` no lugar do que muda a cada campanha/cliente (é essa versão que entra no gerador automático).

## O que eu reproduzi exatamente

- Estrutura e proporção das 4 seções (faixa com logo → foto com título → texto → CTA com botão)
- O selo da logo (moeda com "$" + nome da marca em duas linhas), com border-radius e posição sobrepondo a faixa azul
- Tipografia: **Baloo 2** para os textos em negrito/título/CTA (é a fonte arredondada e "grossa" que aparece na arte original) e **Quicksand** para o corpo de texto e botão — ambas do Google Fonts, carregadas automaticamente pelo `<link>` no `<head>`
- Cores: azul principal, azul do botão (mais claro), dourado da moeda
- Hierarquia dos pesos no título (linhas em negrito vs. linhas em peso regular, do jeito que está na arte)

## O que não reproduzi

A **foto do casal** é uma foto de banco de imagens (direitos de terceiros) — não posso reproduzir uma imagem protegida por direitos de autor. Deixei o espaço marcado no tamanho exato (1080×770px) com um aviso visual; é só trocar pelo `background-image` (ou `<img>`) da foto real do cliente.

## Como plugar no gerador automático

No `arte-completa-template.html`, as variáveis que o script preenche são:

| Variável | O que é |
|---|---|
| `{{COR_PRIMARIA}}` | Azul da faixa do topo e do CTA |
| `{{COR_BOTAO}}` | Azul (mais claro) do botão |
| `{{COR_MOEDA_EXT}}` / `{{COR_MOEDA_INT}}` / `{{COR_DOLAR}}` | Cores da moedinha do selo |
| `{{FOTO}}` | Caminho da foto do cliente |
| `{{MARCA_LINHA1}}` / `{{MARCA_LINHA2}}` | Nome da marca no selo (ex: "Educa" / "Previdência BRB") |
| `{{TITULO_NEGRITO}}` / `{{TITULO_REGULAR}}` | As duas partes do título (pode usar `<br>` dentro do texto pra quebrar linha manualmente, igual na arte original) |
| `{{CORPO}}` | Parágrafo de texto |
| `{{PERGUNTA}}` | Linha em negrito ("Que tal dar um passo hoje?") |
| `{{CTA_TEXTO}}` | Texto da faixa azul final |
| `{{CTA_BOTAO}}` | Texto do botão |

Se quiser, eu já plugo esse template no `generate.js` da plataforma que te mandei antes, como uma segunda opção de layout (você escolheria "layout genérico" ou "layout Educa Previdência" na hora de gerar). Quer que eu faça essa integração?
