// Camada de armazenamento: tudo que o servidor lê/grava (JSONs de dados e imagens) passa por aqui.
// - Sem variáveis do Supabase: usa as pastas locais (data/, uploads/, output/), como sempre foi.
// - Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: guarda tudo num bucket público do Supabase Storage,
//   para que os dados sobrevivam aos reinícios do servidor no Render.
const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;
const BUCKET = process.env.SUPABASE_BUCKET || "arquivos";
const usaSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// caminhos sempre no formato "data/clients.json", "uploads/x.png", "output/2026-09/x.png"
function normalizar(caminho) {
  return caminho.replace(/\\/g, "/").replace(/^\/+/, "");
}

// --- backend local (pastas do projeto) ---
const local = {
  async ler(caminho) {
    const abs = path.join(RAIZ, normalizar(caminho));
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  },
  async salvar(caminho, buffer) {
    const abs = path.join(RAIZ, normalizar(caminho));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
  },
  async listar(pasta) {
    const abs = path.join(RAIZ, normalizar(pasta));
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).filter((nome) => fs.statSync(path.join(abs, nome)).isFile());
  },
  urlPublica: null,
};

// --- backend Supabase Storage ---
function criarSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const bucket = () => supabase.storage.from(BUCKET);

  return {
    async preparar() {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (!data) {
        const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
        if (error && !/already exists/i.test(error.message)) throw error;
        console.log(`Bucket "${BUCKET}" criado no Supabase.`);
      }
    },
    // não usa bucket().download(): a CDN do Supabase devolvia versões antigas do clients.json para o
    // servidor do Render (gravações "sumiam" e a gravação seguinte sobrescrevia dados novos).
    // O parâmetro único na URL faz cada leitura ir direto ao armazenamento.
    async ler(caminho) {
      const caminhoUrl = normalizar(caminho).split("/").map(encodeURIComponent).join("/");
      const url = `${process.env.SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${caminhoUrl}?v=${Date.now()}`;
      const res = await fetch(url, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      // a API do Storage responde 400 tanto para "não existe" quanto para chave inválida; só o primeiro vira null
      // (tratar erro de acesso como "não existe" faria o servidor gravar uma lista vazia por cima dos dados)
      const corpo = await res.text();
      if (res.status === 404 || /NoSuchKey|not_found|InvalidKey/.test(corpo)) return null;
      throw new Error(`Supabase Storage ${res.status} ao ler ${caminho}: ${corpo}`);
    },
    async salvar(caminho, buffer, contentType) {
      const { error } = await bucket().upload(normalizar(caminho), buffer, {
        upsert: true,
        contentType: contentType || "application/octet-stream",
        cacheControl: "0", // artes são regeradas no mesmo caminho; evita imagem antiga em cache
      });
      if (error) throw error;
    },
    async listar(pasta) {
      const { data, error } = await bucket().list(normalizar(pasta), { limit: 1000 });
      if (error) throw error;
      return data.filter((item) => item.id).map((item) => item.name); // itens sem id são subpastas
    },
    urlPublica(caminho) {
      return bucket().getPublicUrl(normalizar(caminho)).data.publicUrl;
    },
  };
}

const backend = usaSupabase ? criarSupabase() : local;

const TIPOS = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", json: "application/json" };
function tipoPorExtensao(caminho) {
  return TIPOS[path.extname(caminho).slice(1).toLowerCase()] || "application/octet-stream";
}

module.exports = {
  usaSupabase,
  async preparar() {
    if (backend.preparar) await backend.preparar();
  },
  lerArquivo: (caminho) => backend.ler(caminho),
  salvarArquivo: (caminho, buffer, contentType) => backend.salvar(caminho, buffer, contentType || tipoPorExtensao(caminho)),
  listarArquivos: (pasta) => backend.listar(pasta),
  // null no modo local (o próprio Express serve os arquivos)
  urlPublica: (caminho) => (backend.urlPublica ? backend.urlPublica(caminho) : null),
  async lerJson(caminho, padrao) {
    const buffer = await backend.ler(caminho);
    return buffer ? JSON.parse(buffer.toString("utf-8")) : padrao;
  },
  async salvarJson(caminho, valor) {
    await backend.salvar(caminho, Buffer.from(JSON.stringify(valor, null, 2)), "application/json");
  },
};
