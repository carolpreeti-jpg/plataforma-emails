// Envia os dados locais (data/, uploads/, output/) para o Supabase, para o site online começar com eles.
// Uso:  npm run enviar-dados   (precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env)
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const storage = require("../storage");

function listarRecursivo(pasta) {
  const abs = path.join(RAIZ, pasta);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).flatMap((nome) => {
    const rel = `${pasta}/${nome}`;
    return fs.statSync(path.join(RAIZ, rel)).isDirectory() ? listarRecursivo(rel) : [rel];
  });
}

async function main() {
  if (!storage.usaSupabase) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env antes de rodar.");
    process.exit(1);
  }
  await storage.preparar();

  const arquivos = ["data", "uploads", "output"].flatMap(listarRecursivo).filter((f) => !f.endsWith(".gitkeep"));
  console.log(`Enviando ${arquivos.length} arquivos...`);
  for (const [i, caminho] of arquivos.entries()) {
    await storage.salvarArquivo(caminho, fs.readFileSync(path.join(RAIZ, caminho)));
    console.log(`  [${i + 1}/${arquivos.length}] ${caminho}`);
  }
  console.log("Pronto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
