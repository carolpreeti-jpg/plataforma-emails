# Plataforma de Artes por Cliente

Site local (roda no seu próprio computador via VSCode) para cadastrar cor e logo de cada cliente e gerar automaticamente a arte de e-mail de cada um, a partir de um único conteúdo.

## Como rodar (primeira vez)

1. Abra a pasta `plataforma-emails` no VSCode.
2. No terminal do VSCode:
   ```
   npm install
   npm start
   ```
3. Abra no navegador: **http://localhost:3000**

Isso já deixa a plataforma no ar. Toda vez que quiser usar de novo, é só `npm start`.

## Como usar

**Aba Clientes** — cadastre cada cliente: nome, cor primária, cor secundária, cor do texto do botão e a logo (arquivo de imagem). Os cards aparecem numa lista, com editar/excluir.

**Aba Conteúdo** — escreva o texto da campanha (tag, título, corpo, texto e link do botão, rodapé). Esse texto é o que será aplicado em todos os clientes.

**Aba Gerar** — clique em "Gerar artes para todos os clientes". A plataforma monta o HTML de cada cliente com a cor/logo certos, tira um print automático (via Puppeteer) e mostra o resultado com botão de baixar.

Os arquivos gerados ficam salvos em `output/`, e os logos enviados ficam em `uploads/`.

## Onde ficam os dados

- `data/clients.json` — lista de clientes (cores, referência da logo)
- `data/content.json` — conteúdo atual da campanha
- `uploads/` — logos enviados pela interface
- `output/` — PNGs gerados

Não precisa de banco de dados: tudo é lido/escrito direto nesses arquivos.

## Próximos passos possíveis

Esse é o primeiro esboço, focado em fazer o fluxo completo funcionar. Se fizer sentido, dá para evoluir depois:

- **Editar o visual da arte**: hoje o layout fica em `template.html`. Se você mandar a arte que já usa no Figma, eu recrio esse template pra ficar idêntico (hoje é um layout genérico de banner + título + texto + botão).
- **Múltiplos templates**: permitir escolher entre mais de um layout de arte na hora de gerar.
- **Histórico de campanhas**: guardar os conteúdos já usados, não só o atual.
- **Exportar tudo de uma vez**: baixar todos os PNGs gerados em um .zip com um clique.

Me diz que já entra nesse esboço.

## Site publicado (Render + Supabase)

Online, o site roda no Render (plano grátis) e guarda clientes, conteúdos, logos e artes no Supabase Storage, porque o disco do Render grátis é apagado a cada reinício.

- O servidor usa o Supabase quando as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas (no Render, em *Environment*; localmente, no arquivo `.env` — veja `.env.example`). Sem elas, usa as pastas locais.
- O bucket público `arquivos` é criado automaticamente na primeira vez que o servidor sobe.
- Para enviar os dados deste computador para o Supabase: preencha o `.env` e rode `npm run enviar-dados`.
- No plano grátis, o site "dorme" após 15 minutos sem uso; o primeiro acesso depois disso demora cerca de 1 minuto.
- O site não tem login: qualquer pessoa com o link pode ver e editar tudo.
