const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const puppeteer = require("puppeteer");
const JSZip = require("jszip");

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, "data");
const CLIENTS_PATH = path.join(DATA_DIR, "clients.json");
const CONTENT_PATH = path.join(DATA_DIR, "content.json");
const TEMPLATE_PATH = path.join(__dirname, "template.html");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUT_DIR = path.join(__dirname, "output");

// --- helpers de leitura/escrita ---
function lerClientes() {
  return JSON.parse(fs.readFileSync(CLIENTS_PATH, "utf-8"));
}
function salvarClientes(clients) {
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(clients, null, 2));
}
const CONTEUDO_VAZIO = { tituloNegrito: "", tituloRegular: "", corpo: "", pergunta: "", ctaTexto: "", ctaBotao: "", foto: null };

function mesAtualPadrao() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

// lê o arquivo inteiro de conteúdos, migrando o formato antigo (um único conteúdo, sem mês) se necessário
function lerTodosConteudos() {
  const dados = JSON.parse(fs.readFileSync(CONTENT_PATH, "utf-8"));
  const pareceFormatoAntigo = "tituloNegrito" in dados || "corpo" in dados;
  if (pareceFormatoAntigo) {
    const migrado = { [mesAtualPadrao()]: dados };
    fs.writeFileSync(CONTENT_PATH, JSON.stringify(migrado, null, 2));
    return migrado;
  }
  return dados;
}
function salvarTodosConteudos(todos) {
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(todos, null, 2));
}
function lerConteudoDoMes(mes) {
  const todos = lerTodosConteudos();
  return { ...CONTEUDO_VAZIO, ...(todos[mes] || {}) };
}
function salvarConteudoDoMes(mes, content) {
  const todos = lerTodosConteudos();
  todos[mes] = content;
  salvarTodosConteudos(todos);
}
const MIME_POR_EXTENSAO = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", svg: "svg+xml" };
function paraDataUri(caminhoRelativo) {
  const absPath = path.join(__dirname, caminhoRelativo);
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime = MIME_POR_EXTENSAO[ext] || "png";
  const buffer = fs.readFileSync(absPath);
  return `data:image/${mime};base64,${buffer.toString("base64")}`;
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// --- upload de logo ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `${Date.now()}-${slugify(path.basename(file.originalname, ext))}${ext}`);
    },
  }),
});

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/output", express.static(OUTPUT_DIR));
app.use(express.static(path.join(__dirname, "public")));

// --- CRUD de clientes ---
app.get("/api/clients", (req, res) => {
  res.json(lerClientes());
});

app.post("/api/clients", upload.single("logo"), (req, res) => {
  const clients = lerClientes();
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
    logo: req.file ? `uploads/${req.file.filename}` : null,
  };

  clients.push(novoCliente);
  salvarClientes(clients);
  res.status(201).json(novoCliente);
});

app.put("/api/clients/:id", upload.single("logo"), (req, res) => {
  const clients = lerClientes();
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
    logo: req.file ? `uploads/${req.file.filename}` : atual.logo,
  };

  salvarClientes(clients);
  res.json(clients[idx]);
});

app.delete("/api/clients/:id", (req, res) => {
  const clients = lerClientes();
  const restantes = clients.filter((c) => c.id !== req.params.id);
  if (restantes.length === clients.length) {
    return res.status(404).json({ erro: "Cliente não encontrado." });
  }
  salvarClientes(restantes);
  res.status(204).end();
});

// --- conteúdo da campanha (um por mês) ---
app.get("/api/months", (req, res) => {
  const todos = lerTodosConteudos();
  res.json(Object.keys(todos).sort());
});

app.get("/api/content", (req, res) => {
  const mes = req.query.mes || mesAtualPadrao();
  res.json(lerConteudoDoMes(mes));
});

app.post("/api/content", upload.single("foto"), (req, res) => {
  const mes = req.body.mes || mesAtualPadrao();
  const atual = lerConteudoDoMes(mes);
  const { tituloNegrito, tituloRegular, corpo, pergunta, ctaTexto, ctaBotao } = req.body;

  const content = {
    tituloNegrito: tituloNegrito ?? atual.tituloNegrito ?? "",
    tituloRegular: tituloRegular ?? atual.tituloRegular ?? "",
    corpo: corpo ?? atual.corpo ?? "",
    pergunta: pergunta ?? atual.pergunta ?? "",
    ctaTexto: ctaTexto ?? atual.ctaTexto ?? "",
    ctaBotao: ctaBotao ?? atual.ctaBotao ?? "",
    foto: req.file ? `uploads/${req.file.filename}` : atual.foto || null,
  };

  salvarConteudoDoMes(mes, content);
  res.json(content);
});

// --- geração das artes ---
function preencherTemplate(templateHtml, dados) {
  let html = templateHtml;
  for (const [chave, valor] of Object.entries(dados)) {
    const placeholder = new RegExp(`{{\\s*${chave}\\s*}}`, "g");
    html = html.replace(placeholder, valor ?? "");
  }
  return html;
}

app.post("/api/generate", async (req, res) => {
  try {
    const todosClientes = lerClientes();
    const mes = (req.body && req.body.mes) || mesAtualPadrao();
    const content = lerConteudoDoMes(mes);
    const templateHtml = fs.readFileSync(TEMPLATE_PATH, "utf-8");

    if (todosClientes.length === 0) {
      return res.status(400).json({ erro: "Cadastre ao menos um cliente antes de gerar." });
    }

    const { clientId } = req.body || {};
    const clients = clientId ? todosClientes.filter((c) => c.id === clientId) : todosClientes;

    if (clients.length === 0) {
      return res.status(404).json({ erro: "Cliente não encontrado." });
    }

    const pastaDoMes = path.join(OUTPUT_DIR, mes);
    fs.mkdirSync(pastaDoMes, { recursive: true });

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const resultados = [];

    const fotoUri = content.foto ? paraDataUri(content.foto) : "";

    for (const cliente of clients) {
      if (!cliente.logo) {
        resultados.push({ id: cliente.id, nome: cliente.nome, erro: "sem logo cadastrada" });
        continue;
      }

      const dados = {
        COR_PRIMARIA: cliente.corPrimaria,
        COR_BOTAO: cliente.corSecundaria,
        LOGO: paraDataUri(cliente.logo),
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
      await page.setContent(htmlFinal, { waitUntil: "networkidle0" });

      const elemento = await page.$(".arte");
      const nomeArquivo = `${cliente.id}.png`;
      await elemento.screenshot({ path: path.join(pastaDoMes, nomeArquivo) });

      resultados.push({ id: cliente.id, nome: cliente.nome, imagem: `output/${mes}/${nomeArquivo}` });
    }

    await browser.close();
    res.json(resultados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao gerar as artes.", detalhe: err.message });
  }
});

app.get("/api/download-zip", async (req, res) => {
  try {
    const mes = req.query.mes || mesAtualPadrao();
    const pastaDoMes = path.join(OUTPUT_DIR, mes);

    if (!fs.existsSync(pastaDoMes)) {
      return res.status(404).json({ erro: "Nenhuma arte gerada para esse mês ainda." });
    }

    const arquivos = fs.readdirSync(pastaDoMes).filter((f) => f.toLowerCase().endsWith(".png"));
    if (arquivos.length === 0) {
      return res.status(404).json({ erro: "Nenhuma arte gerada para esse mês ainda." });
    }

    const zip = new JSZip();
    arquivos.forEach((nomeArquivo) => {
      zip.file(nomeArquivo, fs.readFileSync(path.join(pastaDoMes, nomeArquivo)));
    });

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="artes-${mes}.zip"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao gerar o zip.", detalhe: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nPlataforma rodando em http://localhost:${PORT}\n`);
});
