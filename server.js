const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const puppeteer = require("puppeteer");
const JSZip = require("jszip");
const sharp = require("sharp");
const storage = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENTS_PATH = "data/clients.json";
const CONTENT_PATH = "data/content.json";
const TEMPLATE_PATH = path.join(__dirname, "template.html");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUT_DIR = path.join(__dirname, "output");

// --- helpers de leitura/escrita ---
function lerClientes() {
  return storage.lerJson(CLIENTS_PATH, []);
}
function salvarClientes(clients) {
  return storage.salvarJson(CLIENTS_PATH, clients);
}
const CONTEUDO_VAZIO = { tituloNegrito: "", tituloRegular: "", corpo: "", pergunta: "", ctaTexto: "", ctaBotao: "", foto: null };

function mesAtualPadrao() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

// lê o arquivo inteiro de conteúdos, migrando o formato antigo (um único conteúdo, sem mês) se necessário
async function lerTodosConteudos() {
  const dados = await storage.lerJson(CONTENT_PATH, {});
  const pareceFormatoAntigo = "tituloNegrito" in dados || "corpo" in dados;
  if (pareceFormatoAntigo) {
    const migrado = { [mesAtualPadrao()]: dados };
    await storage.salvarJson(CONTENT_PATH, migrado);
    return migrado;
  }
  return dados;
}
function salvarTodosConteudos(todos) {
  return storage.salvarJson(CONTENT_PATH, todos);
}
async function lerConteudoDoMes(mes) {
  const todos = await lerTodosConteudos();
  return { ...CONTEUDO_VAZIO, ...(todos[mes] || {}) };
}
async function salvarConteudoDoMes(mes, content) {
  const todos = await lerTodosConteudos();
  todos[mes] = content;
  await salvarTodosConteudos(todos);
}
const MIME_POR_EXTENSAO = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", svg: "svg+xml" };
async function paraDataUri(caminhoRelativo) {
  const ext = path.extname(caminhoRelativo).slice(1).toLowerCase();
  const mime = MIME_POR_EXTENSAO[ext] || "png";
  const buffer = await storage.lerArquivo(caminhoRelativo);
  if (!buffer) throw new Error(`Arquivo não encontrado: ${caminhoRelativo}`);
  return `data:image/${mime};base64,${buffer.toString("base64")}`;
}

// a foto de fundo ocupa 1080px de largura na arte (2160px no print 2x); fotos maiores só deixam o
// Chromium lento — no servidor grátis do Render, uma foto de 4500px estourava o tempo limite
async function fotoParaDataUri(caminhoRelativo) {
  const buffer = await storage.lerArquivo(caminhoRelativo);
  if (!buffer) throw new Error(`Arquivo não encontrado: ${caminhoRelativo}`);
  const reduzida = await sharp(buffer).rotate().resize({ width: 2160, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${reduzida.toString("base64")}`;
}

// evita "linha órfã" (última linha de um parágrafo com uma palavra só):
// une as duas últimas palavras de cada linha com espaço não separável
function protegerOrfas(texto) {
  if (!texto) return texto;
  return texto
    .split("\n")
    .map((linha) => {
      const idx = linha.trimEnd().lastIndexOf(" ");
      if (idx === -1) return linha;
      return linha.slice(0, idx) + " " + linha.slice(idx + 1);
    })
    .join("\n");
}

function slugify(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// express 4 não captura erros de handlers async; isso repassa para o tratador de erro
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- upload de logo/foto (fica em memória e é gravado via storage) ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function salvarUpload(file, pasta = "uploads") {
  if (!file) return null;
  const ext = path.extname(file.originalname) || ".png";
  const caminho = `${pasta}/${Date.now()}-${slugify(path.basename(file.originalname, ext))}${ext}`;
  await storage.salvarArquivo(caminho, file.buffer, file.mimetype);
  return caminho;
}

// --- fontes do cliente (uma família para títulos, outra para textos) ---
const EXTENSOES_FONTE = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };
const MIME_FONTE = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };

// o título usa negrito e regular juntos, então cada família pode ter vários arquivos;
// o peso de cada um sai do nome do arquivo (ex.: "Montserrat-ExtraBold.ttf" → 800)
function pesoPeloNome(nome) {
  const n = nome.toLowerCase().replace(/[\s_-]/g, "");
  if (/variable|\[wght/.test(n)) return "100 900";
  const pesos = [
    [/thin|hairline/, 100], [/extralight|ultralight/, 200], [/semibold|demibold/, 600],
    [/extrabold|ultrabold/, 800], [/black|heavy/, 900], [/light/, 300], [/medium/, 500], [/bold/, 700],
  ];
  const achado = pesos.find(([re]) => re.test(n));
  return achado ? String(achado[1]) : "400";
}

// "Montserrat-ExtraBold.ttf" → "Montserrat"; "PlayfairDisplay-VariableFont_wght.ttf" → "Playfair Display"
function nomeDaFamilia(nomeArquivo) {
  const base = path.basename(nomeArquivo, path.extname(nomeArquivo)).split(/[-_\[]/)[0];
  return base.replace(/([a-z])([A-Z])/g, "$1 $2").trim() || base;
}

async function salvarFonte(arquivos) {
  if (!arquivos || arquivos.length === 0) return null;
  const invalidos = arquivos.filter((f) => !EXTENSOES_FONTE[path.extname(f.originalname).slice(1).toLowerCase()]);
  if (invalidos.length) {
    const erro = new Error(`Arquivo de fonte inválido: ${invalidos.map((f) => f.originalname).join(", ")} (use .ttf, .otf, .woff ou .woff2)`);
    erro.status = 400;
    throw erro;
  }
  const salvos = [];
  for (const f of arquivos) {
    salvos.push({
      caminho: await salvarUpload(f, "uploads/fontes"),
      arquivo: f.originalname,
      peso: pesoPeloNome(f.originalname),
      estilo: /italic|oblique/i.test(f.originalname) ? "italic" : "normal",
    });
  }
  return { nome: nomeDaFamilia(arquivos[0].originalname), arquivos: salvos };
}

// fonte nova enviada → substitui; pedido de remoção → volta para a padrão; senão mantém a atual
async function fonteAtualizada(req, campo, atual) {
  const nova = await salvarFonte(req.files && req.files[campo]);
  if (nova) return nova;
  if (req.body[`remover_${campo}`] === "1") return null;
  return atual || null;
}

const uploadCliente = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "fonteTitulo", maxCount: 20 },
  { name: "fonteTexto", maxCount: 20 },
]);
const arquivoLogo = (req) => req.files && req.files.logo && req.files.logo[0];

app.use(express.json());
if (storage.usaSupabase) {
  // as imagens moram no Supabase; o servidor repassa para manter os mesmos endereços (e o download funcionando)
  app.get(/^\/(uploads|output)\/.+/, rota(async (req, res) => {
    const caminho = decodeURIComponent(req.path);
    const buffer = await storage.lerArquivo(caminho);
    if (!buffer) return res.status(404).end();
    res.type(path.extname(caminho));
    res.setHeader("Cache-Control", "no-cache");
    res.send(buffer);
  }));
} else {
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.use("/output", express.static(OUTPUT_DIR));
}
app.use(express.static(path.join(__dirname, "public")));

// --- CRUD de clientes ---
app.get("/api/clients", rota(async (req, res) => {
  res.json(await lerClientes());
}));

app.post("/api/clients", uploadCliente, rota(async (req, res) => {
  const clients = await lerClientes();
  const { nome, corPrimaria, corSecundaria, corTexto } = req.body;

  if (!nome || !corPrimaria) {
    return res.status(400).json({ erro: "Nome e cor primária são obrigatórios." });
  }

  const novoCliente = {
    id: `${slugify(nome)}-${Date.now().toString(36)}`,
    nome,
    corPrimaria,
    corSecundaria: corSecundaria || "#EEEEEE",
    corTexto: corTexto || "#FFFFFF",
    logo: await salvarUpload(arquivoLogo(req)),
  };
  // "Copiar" no popup do cliente: a cópia começa com as mesmas fontes do original
  const original = req.body.copiarFontesDe && clients.find((c) => c.id === req.body.copiarFontesDe);
  novoCliente.fonteTitulo = await fonteAtualizada(req, "fonteTitulo", original ? original.fonteTitulo : null);
  novoCliente.fonteTexto = await fonteAtualizada(req, "fonteTexto", original ? original.fonteTexto : null);

  clients.push(novoCliente);
  await salvarClientes(clients);
  res.status(201).json(novoCliente);
}));

app.put("/api/clients/:id", uploadCliente, rota(async (req, res) => {
  const clients = await lerClientes();
  const idx = clients.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: "Cliente não encontrado." });

  const atual = clients[idx];
  const { nome, corPrimaria, corSecundaria, corTexto } = req.body;

  clients[idx] = {
    ...atual,
    nome: nome || atual.nome,
    corPrimaria: corPrimaria || atual.corPrimaria,
    corSecundaria: corSecundaria || atual.corSecundaria,
    corTexto: corTexto || atual.corTexto,
    logo: (await salvarUpload(arquivoLogo(req))) || atual.logo,
    fonteTitulo: await fonteAtualizada(req, "fonteTitulo", atual.fonteTitulo),
    fonteTexto: await fonteAtualizada(req, "fonteTexto", atual.fonteTexto),
  };

  await salvarClientes(clients);
  res.json(clients[idx]);
}));

app.delete("/api/clients/:id", rota(async (req, res) => {
  const clients = await lerClientes();
  const restantes = clients.filter((c) => c.id !== req.params.id);
  if (restantes.length === clients.length) {
    return res.status(404).json({ erro: "Cliente não encontrado." });
  }
  await salvarClientes(restantes);
  res.status(204).end();
}));

// --- conteúdo da campanha (um por mês) ---
app.get("/api/months", rota(async (req, res) => {
  const todos = await lerTodosConteudos();
  res.json(Object.keys(todos).sort());
}));

app.get("/api/content", rota(async (req, res) => {
  const mes = req.query.mes || mesAtualPadrao();
  res.json(await lerConteudoDoMes(mes));
}));

app.post("/api/content", upload.single("foto"), rota(async (req, res) => {
  const mes = req.body.mes || mesAtualPadrao();
  const atual = await lerConteudoDoMes(mes);
  const { tituloNegrito, tituloRegular, corpo, pergunta, ctaTexto, ctaBotao } = req.body;

  const content = {
    tituloNegrito: tituloNegrito ?? atual.tituloNegrito ?? "",
    tituloRegular: tituloRegular ?? atual.tituloRegular ?? "",
    corpo: corpo ?? atual.corpo ?? "",
    pergunta: pergunta ?? atual.pergunta ?? "",
    ctaTexto: ctaTexto ?? atual.ctaTexto ?? "",
    ctaBotao: ctaBotao ?? atual.ctaBotao ?? "",
    foto: (await salvarUpload(req.file)) || atual.foto || null,
  };

  await salvarConteudoDoMes(mes, content);
  res.json(content);
}));

// --- geração das artes ---
const FONTE_TITULO_PADRAO = "'Baloo 2', sans-serif";
const FONTE_TEXTO_PADRAO = "'Quicksand', sans-serif";

// @font-face embutido (data URI) para cada arquivo da família; o Chromium não precisa buscar nada na rede
async function cssDaFonte(fonte, familiaInterna) {
  if (!fonte || !fonte.arquivos || fonte.arquivos.length === 0) return "";
  const regras = [];
  for (const arq of fonte.arquivos) {
    const ext = path.extname(arq.caminho).slice(1).toLowerCase();
    const buffer = await storage.lerArquivo(arq.caminho);
    if (!buffer) throw new Error(`Arquivo de fonte não encontrado: ${arq.caminho}`);
    regras.push(
      `@font-face { font-family: '${familiaInterna}'; font-weight: ${arq.peso}; font-style: ${arq.estilo}; ` +
        `src: url(data:${MIME_FONTE[ext]};base64,${buffer.toString("base64")}) format('${EXTENSOES_FONTE[ext]}'); }`
    );
  }
  return regras.join("\n");
}
function preencherTemplate(templateHtml, dados) {
  let html = templateHtml;
  for (const [chave, valor] of Object.entries(dados)) {
    const placeholder = new RegExp(`{{\\s*${chave}\\s*}}`, "g");
    html = html.replace(placeholder, valor ?? "");
  }
  return html;
}

app.post("/api/generate", async (req, res) => {
  let browser;
  try {
    const todosClientes = await lerClientes();
    const mes = (req.body && req.body.mes) || mesAtualPadrao();
    const content = await lerConteudoDoMes(mes);
    const templateHtml = fs.readFileSync(TEMPLATE_PATH, "utf-8");

    if (todosClientes.length === 0) {
      return res.status(400).json({ erro: "Cadastre ao menos um cliente antes de gerar." });
    }

    const { clientId } = req.body || {};
    const clients = clientId ? todosClientes.filter((c) => c.id === clientId) : todosClientes;

    if (clients.length === 0) {
      return res.status(404).json({ erro: "Cliente não encontrado." });
    }

    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    page.setDefaultTimeout(120000); // o servidor grátis do Render é bem mais lento que um computador
    const resultados = [];

    const fotoUri = content.foto ? await fotoParaDataUri(content.foto) : "";

    for (const cliente of clients) {
      if (!cliente.logo) {
        resultados.push({ id: cliente.id, nome: cliente.nome, erro: "sem logo cadastrada" });
        continue;
      }

      const temFonteTitulo = Boolean(cliente.fonteTitulo && cliente.fonteTitulo.arquivos && cliente.fonteTitulo.arquivos.length);
      const temFonteTexto = Boolean(cliente.fonteTexto && cliente.fonteTexto.arquivos && cliente.fonteTexto.arquivos.length);

      const dados = {
        FONTES_CSS: (await cssDaFonte(cliente.fonteTitulo, "Fonte Titulo Cliente")) + "\n" + (await cssDaFonte(cliente.fonteTexto, "Fonte Texto Cliente")),
        FONTE_TITULO: temFonteTitulo ? `'Fonte Titulo Cliente', ${FONTE_TITULO_PADRAO}` : FONTE_TITULO_PADRAO,
        FONTE_TEXTO: temFonteTexto ? `'Fonte Texto Cliente', ${FONTE_TEXTO_PADRAO}` : FONTE_TEXTO_PADRAO,
        COR_PRIMARIA: cliente.corPrimaria,
        COR_BOTAO: cliente.corSecundaria,
        LOGO: await paraDataUri(cliente.logo),
        FOTO: fotoUri,
        TITULO_NEGRITO: protegerOrfas(content.tituloNegrito),
        TITULO_REGULAR: protegerOrfas(content.tituloRegular),
        CORPO: protegerOrfas(content.corpo),
        PERGUNTA: protegerOrfas(content.pergunta),
        CTA_TEXTO: protegerOrfas(content.ctaTexto),
        CTA_BOTAO: protegerOrfas(content.ctaBotao),
      };

      const htmlFinal = preencherTemplate(templateHtml, dados);

      await page.setViewport({ width: 1080, height: 1600, deviceScaleFactor: 2 });
      // "load" + fontes prontas em vez de "networkidle0": no Render, esperar a rede ficar ociosa travava a geração
      await page.setContent(htmlFinal, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.equilibrarTitulo());

      const elemento = await page.$(".arte");
      const caminho = `output/${mes}/${cliente.id}.png`;
      await storage.salvarArquivo(caminho, await elemento.screenshot(), "image/png");

      resultados.push({ id: cliente.id, nome: cliente.nome, imagem: caminho });
    }

    res.json(resultados);
  } catch (err) {
    console.error(err);
    const navegador = browser ? await browser.version().catch(() => "?") : "não abriu";
    res.status(500).json({ erro: "Falha ao gerar as artes.", detalhe: err.message, navegador });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/api/download-zip", async (req, res) => {
  try {
    const mes = req.query.mes || mesAtualPadrao();
    const arquivos = (await storage.listarArquivos(`output/${mes}`)).filter((f) => f.toLowerCase().endsWith(".png"));
    if (arquivos.length === 0) {
      return res.status(404).json({ erro: "Nenhuma arte gerada para esse mês ainda." });
    }

    const zip = new JSZip();
    for (const nomeArquivo of arquivos) {
      zip.file(nomeArquivo, await storage.lerArquivo(`output/${mes}/${nomeArquivo}`));
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="artes-${mes}.zip"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao gerar o zip.", detalhe: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ erro: err.status ? err.message : "Erro no servidor.", detalhe: err.message });
});

storage
  .preparar()
  .then(() => {
    app.listen(PORT, () => {
      const onde = storage.usaSupabase ? "Supabase" : "pastas locais";
      console.log(`\nPlataforma rodando em http://localhost:${PORT} (dados: ${onde})\n`);
    });
  })
  .catch((err) => {
    console.error("Não foi possível conectar ao armazenamento:", err);
    process.exit(1);
  });
