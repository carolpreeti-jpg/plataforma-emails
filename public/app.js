// --- dropdown customizado (substitui o <select> nativo, cuja lista o navegador renderiza
// com estilo próprio — fundo branco, sem controle sobre cor/raio/scrollbar) ---
function criarDropdown(container) {
  const toggle = container.querySelector(".dropdown-toggle");
  const label = container.querySelector(".dropdown-label");
  const menu = container.querySelector(".dropdown-menu");
  let valorAtual = null;
  let aoMudar = null;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".dropdown.open").forEach((d) => {
      if (d !== container) d.classList.remove("open");
    });
    container.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) container.classList.remove("open");
  });

  const dropdown = {
    setOptions(opcoes) {
      menu.innerHTML = opcoes
        .map((o) => `<div class="dropdown-item" data-value="${o.value}">${o.texto}</div>`)
        .join("");
      menu.querySelectorAll(".dropdown-item").forEach((item) => {
        item.addEventListener("click", () => {
          dropdown.setValue(item.dataset.value, true);
          container.classList.remove("open");
        });
      });
    },
    setValue(valor, disparaEvento) {
      valorAtual = valor;
      const item = menu.querySelector(`[data-value="${CSS.escape(String(valor))}"]`);
      label.textContent = item ? item.textContent : "";
      menu.querySelectorAll(".dropdown-item").forEach((i) => {
        i.classList.toggle("selected", i.dataset.value === valor);
      });
      if (disparaEvento && aoMudar) aoMudar(valor);
    },
    getValue() {
      return valorAtual;
    },
    onChange(cb) {
      aoMudar = cb;
    },
  };

  return dropdown;
}

// --- navegação entre abas ---
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

function irParaAba(nomeAba) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === nomeAba));
  panels.forEach((p) => p.classList.toggle("active", p.id === `panel-${nomeAba}`));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => irParaAba(tab.dataset.tab));
});

// --- helpers de cor: sincronizar input color e hex text em TEMPO REAL ---
function setupColorSync() {
  const cores = [
    { id: "corPrimaria", hexId: "primaria" },
    { id: "corSecundaria", hexId: "secundaria" },
    { id: "corTexto", hexId: "texto" }
  ];

  cores.forEach(({ id, hexId }) => {
    const colorInput = document.getElementById(id);
    const hexInput = document.getElementById(`hex-${hexId}-input`);
    const preview = document.getElementById(`preview-${hexId}`);

    if (!colorInput || !hexInput) return;

    function isValidHex(hex) {
      return /^#[0-9A-F]{6}$/i.test(hex) || /^[0-9A-F]{6}$/i.test(hex);
    }

    function normalizeHex(hex) {
      hex = hex.trim().toUpperCase();
      if (!hex.startsWith("#")) hex = "#" + hex;
      return hex;
    }

    function syncAll(hexValue) {
      const normalized = normalizeHex(hexValue);
      if (isValidHex(normalized)) {
        colorInput.value = normalized;
        hexInput.value = normalized;
        if (preview) preview.style.background = normalized;
      }
    }

    // Digitar no campo HEX
    hexInput.addEventListener("input", (e) => {
      const valor = normalizeHex(e.target.value);
      if (isValidHex(valor)) {
        colorInput.value = valor;
        hexInput.value = valor;
        if (preview) preview.style.background = valor;
      }
    });

    // Clicar no color picker
    colorInput.addEventListener("input", (e) => {
      syncAll(e.target.value);
    });
    colorInput.addEventListener("change", (e) => {
      syncAll(e.target.value);
    });

    // Ao sair do campo HEX
    hexInput.addEventListener("blur", () => {
      const valor = normalizeHex(hexInput.value);
      if (!isValidHex(valor)) {
        hexInput.value = colorInput.value;
      } else {
        syncAll(valor);
      }
    });

    // Enter no campo HEX
    hexInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") hexInput.blur();
    });
  });
}

// Executar quando o DOM carregar
setupColorSync();

// ======================= CLIENTES =======================

const listaClientes = document.getElementById("lista-clientes");
const formCliente = document.getElementById("form-cliente");
const formClienteTitulo = document.getElementById("form-cliente-titulo");
const clienteIdEditando = document.getElementById("cliente-id-editando");
const btnCancelarEdicao = document.getElementById("btn-cancelar-edicao");

const dropdownClienteTeste = criarDropdown(document.getElementById("select-cliente-teste"));

async function carregarClientes() {
  const res = await fetch("/api/clients");
  const clientes = await res.json();
  renderClientes(clientes);
  renderSelectClienteTeste(clientes);
}

function renderSelectClienteTeste(clientes) {
  dropdownClienteTeste.setOptions(clientes.map((c) => ({ value: c.id, texto: c.nome })));
  if (clientes.length) dropdownClienteTeste.setValue(clientes[0].id, false);
}

function renderClientes(clientes) {
  listaClientes.innerHTML = "";

  if (clientes.length === 0) {
    listaClientes.innerHTML = `<div class="empty-state">Nenhum cliente cadastrado ainda. Use o formulário abaixo.</div>`;
    return;
  }

  clientes.forEach((cliente) => {
    const card = document.createElement("div");
    card.className = "client-card";
    card.innerHTML = `
      <div class="client-logo ${cliente.logo ? "" : "empty"}">
        ${cliente.logo ? `<img src="/${cliente.logo}" alt="${cliente.nome}">` : "sem logo"}
      </div>
      <div class="client-name">${cliente.nome}</div>
    `;
    card.addEventListener("click", () => abrirModalCliente(cliente));
    listaClientes.appendChild(card);
  });
}

// --- popup com detalhes do cliente ---
const modalOverlay = document.getElementById("modal-overlay");
const modalContent = document.getElementById("modal-cliente-content");
const modalClose = document.getElementById("modal-close");

function abrirModalCliente(cliente) {
  modalContent.innerHTML = `
    <div class="modal-logo ${cliente.logo ? "" : "empty"}">
      ${cliente.logo ? `<img src="/${cliente.logo}" alt="${cliente.nome}">` : "sem logo"}
    </div>
    <div class="modal-name">${cliente.nome}</div>
    <div class="modal-swatches">
      <div class="swatch">
        <div class="swatch-color" style="background:${cliente.corPrimaria}"></div>
        <span class="swatch-hex">${cliente.corPrimaria}</span>
      </div>
      <div class="swatch">
        <div class="swatch-color" style="background:${cliente.corSecundaria}"></div>
        <span class="swatch-hex">${cliente.corSecundaria}</span>
      </div>
      <div class="swatch">
        <div class="swatch-color" style="background:${cliente.corTexto}"></div>
        <span class="swatch-hex">${cliente.corTexto}</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" id="modal-btn-copiar">Copiar</button>
      <button class="btn ghost" id="modal-btn-editar">Editar</button>
      <button class="btn danger" id="modal-btn-excluir">Excluir</button>
    </div>
  `;

  modalContent.querySelector("#modal-btn-editar").addEventListener("click", () => {
    fecharModalCliente();
    editarCliente(cliente);
  });
  modalContent.querySelector("#modal-btn-copiar").addEventListener("click", () => {
    fecharModalCliente();
    copiarCliente(cliente);
  });
  modalContent.querySelector("#modal-btn-excluir").addEventListener("click", () => {
    fecharModalCliente();
    excluirCliente(cliente.id);
  });

  modalOverlay.classList.add("active");
}

function fecharModalCliente() {
  modalOverlay.classList.remove("active");
}

modalClose.addEventListener("click", fecharModalCliente);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) fecharModalCliente();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalCliente();
});

function editarCliente(cliente) {
  formClienteTitulo.textContent = `Editando: ${cliente.nome}`;
  clienteIdEditando.value = cliente.id;
  document.getElementById("nome").value = cliente.nome;
  document.getElementById("corPrimaria").value = cliente.corPrimaria;
  document.getElementById("corSecundaria").value = cliente.corSecundaria;
  document.getElementById("corTexto").value = cliente.corTexto;
  document.getElementById("hex-primaria-input").value = cliente.corPrimaria;
  document.getElementById("hex-secundaria-input").value = cliente.corSecundaria;
  document.getElementById("hex-texto-input").value = cliente.corTexto;
  
  // Atualizar os previews também
  document.getElementById("preview-primaria").style.background = cliente.corPrimaria;
  document.getElementById("preview-secundaria").style.background = cliente.corSecundaria;
  document.getElementById("preview-texto").style.background = cliente.corTexto;
  
  btnCancelarEdicao.style.display = "inline-block";
  formCliente.scrollIntoView({ behavior: "smooth" });
}

btnCancelarEdicao.addEventListener("click", () => {
  formCliente.reset();
  formClienteTitulo.textContent = "Novo cliente";
  clienteIdEditando.value = "";
  btnCancelarEdicao.style.display = "none";
});

async function excluirCliente(id) {
  if (!confirm("Excluir este cliente?")) return;
  await fetch(`/api/clients/${id}`, { method: "DELETE" });
  carregarClientes();
}

async function copiarCliente(cliente) {
  const novoNome = `${cliente.nome} - Cópia`;
  
  const dados = new FormData();
  dados.append("nome", novoNome);
  dados.append("corPrimaria", cliente.corPrimaria);
  dados.append("corSecundaria", cliente.corSecundaria);
  dados.append("corTexto", cliente.corTexto);

  try {
    await fetch("/api/clients", { method: "POST", body: dados });
    carregarClientes();
  } catch (err) {
    alert("Erro ao copiar cliente");
    console.error(err);
  }
}

formCliente.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Sincronizar os campos HEX com os color pickers antes de enviar
  ["corPrimaria", "corSecundaria", "corTexto"].forEach((id) => {
    const colorInput = document.getElementById(id);
    const hexInput = document.getElementById(`${id.replace("cor", "").toLowerCase()}-input`);
    if (colorInput && hexInput) {
      let valor = hexInput.value.trim();
      if (!valor.startsWith("#")) {
        valor = "#" + valor;
      }
      if (/^#([0-9A-F]{3}){1,2}$/i.test(valor)) {
        colorInput.value = valor;
      }
    }
  });

  const dados = new FormData();
  dados.append("nome", document.getElementById("nome").value);
  dados.append("corPrimaria", document.getElementById("corPrimaria").value);
  dados.append("corSecundaria", document.getElementById("corSecundaria").value);
  dados.append("corTexto", document.getElementById("corTexto").value);

  const arquivoLogo = document.getElementById("logo").files[0];
  if (arquivoLogo) dados.append("logo", arquivoLogo);

  const id = clienteIdEditando.value;
  const url = id ? `/api/clients/${id}` : "/api/clients";
  const method = id ? "PUT" : "POST";

  await fetch(url, { method, body: dados });

  formCliente.reset();
  formClienteTitulo.textContent = "Novo cliente";
  clienteIdEditando.value = "";
  btnCancelarEdicao.style.display = "none";
  carregarClientes();
});

// ======================= MÊS DA CAMPANHA =======================
// os e-mails são mensais: o conteúdo é salvo e recuperado separadamente para cada mês.
// os dois seletores (aba Conteúdo e aba Gerar) ficam sincronizados e persistem no localStorage.

const dropdownMesConteudo = criarDropdown(document.getElementById("mes-conteudo"));
const dropdownMesGerar = criarDropdown(document.getElementById("mes-gerar"));

const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function mesAtualPadrao() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

function formatarMes(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return `${NOMES_MESES[mes - 1]} de ${ano}`;
}

// gera as opções de mês (6 antes e 12 depois do mês atual, em português)
function popularSeletorMeses(dropdown, selecionado) {
  const [anoBase, mesBase] = mesAtualPadrao().split("-").map(Number);
  const chaves = [];
  for (let offset = -6; offset <= 12; offset++) {
    const data = new Date(anoBase, mesBase - 1 + offset, 1);
    chaves.push(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`);
  }
  if (!chaves.includes(selecionado)) chaves.push(selecionado);
  chaves.sort();

  dropdown.setOptions(chaves.map((chave) => ({ value: chave, texto: formatarMes(chave) })));
  dropdown.setValue(selecionado, false);
}

function getMesAtual() {
  return localStorage.getItem("mesAtual") || mesAtualPadrao();
}

function setMesAtual(mes) {
  localStorage.setItem("mesAtual", mes);
  popularSeletorMeses(dropdownMesConteudo, mes);
  popularSeletorMeses(dropdownMesGerar, mes);
}

dropdownMesConteudo.onChange((mes) => {
  setMesAtual(mes);
  limparCamposConteudo();
});
dropdownMesGerar.onChange((mes) => {
  setMesAtual(mes);
});

// ======================= COLAR TEXTO (preenche os campos automaticamente) =======================

const ROTULOS_CAMPOS = [
  { campo: "tituloNegrito", rotulos: ["título negrito", "titulo negrito"] },
  { campo: "tituloRegular", rotulos: ["título regular", "titulo regular"] },
  { campo: "corpo", rotulos: ["corpo"] },
  { campo: "pergunta", rotulos: ["pergunta"] },
  { campo: "ctaTexto", rotulos: ["cta texto", "texto do cta", "texto da faixa final"] },
  { campo: "ctaBotao", rotulos: ["cta botão", "cta botao", "botão", "botao", "texto do botão"] },
];

function extrairCamposDoTexto(texto) {
  const resultado = {};
  let campoAtual = null;
  let buffer = [];

  function fecharCampo() {
    if (campoAtual) resultado[campoAtual] = buffer.join("\n").trim();
    buffer = [];
  }

  texto.split("\n").forEach((linha) => {
    const idx = linha.indexOf(":");
    const rotulo = idx !== -1 ? linha.slice(0, idx).trim().toLowerCase() : null;
    const match = rotulo && ROTULOS_CAMPOS.find((r) => r.rotulos.includes(rotulo));

    if (match) {
      fecharCampo();
      campoAtual = match.campo;
      buffer = [linha.slice(idx + 1).trim()];
    } else if (campoAtual) {
      buffer.push(linha);
    }
  });
  fecharCampo();

  return resultado;
}

// Quando o texto colado não usa rótulos, identifica cada parte pela posição/estrutura:
// 1ª linha = título (separado no 1º vírgula em negrito/regular), última linha = botão,
// a linha com "?" no meio = pergunta, a linha logo antes do botão = texto do CTA,
// o que sobrar = corpo.
function extrairCamposAutomatico(texto) {
  const resultado = {};
  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhas.length === 0) return resultado;

  const primeira = linhas[0];
  const idxVirgula = primeira.indexOf(",");
  if (idxVirgula !== -1) {
    resultado.tituloNegrito = primeira.slice(0, idxVirgula + 1).trim();
    resultado.tituloRegular = primeira.slice(idxVirgula + 1).trim();
  } else {
    resultado.tituloNegrito = primeira;
  }

  let meio = linhas.slice(1);

  if (meio.length > 0) {
    const botao = meio[meio.length - 1].replace(/^[<\[(«"'\s]+|[>\])»"'\s]+$/g, "").trim();
    resultado.ctaBotao = botao;
    meio = meio.slice(0, -1);
  }

  const idxPergunta = meio.findIndex((l) => l.endsWith("?"));
  if (idxPergunta !== -1) {
    resultado.pergunta = meio[idxPergunta];
    meio.splice(idxPergunta, 1);
  }

  if (meio.length > 0) {
    resultado.ctaTexto = meio[meio.length - 1];
    meio = meio.slice(0, -1);
  }

  if (meio.length > 0) {
    resultado.corpo = meio.join(" ").trim();
  }

  return resultado;
}

document.getElementById("btn-extrair-texto").addEventListener("click", () => {
  const texto = document.getElementById("colar-texto").value;
  let campos = extrairCamposDoTexto(texto);
  if (!Object.values(campos).some((v) => v)) {
    campos = extrairCamposAutomatico(texto);
  }
  const status = document.getElementById("extrair-status");

  const encontrados = Object.entries(campos).filter(([, valor]) => valor);
  encontrados.forEach(([campo, valor]) => {
    document.getElementById(campo).value = valor;
  });

  status.textContent = encontrados.length
    ? `${encontrados.length} campo(s) preenchido(s) ✓`
    : "nenhum campo reconhecido — confira o formato do texto colado";
  setTimeout(() => (status.textContent = ""), 3000);
});

// ======================= CONTEÚDO =======================

const formConteudo = document.getElementById("form-conteudo");
const conteudoStatus = document.getElementById("conteudo-status");
const CAMPOS_CONTEUDO = ["tituloNegrito", "tituloRegular", "corpo", "pergunta", "ctaTexto", "ctaBotao"];

// os campos só são preenchidos pela extração do texto colado (ver "Colar texto da campanha"),
// nunca automaticamente ao abrir a aba ou trocar de mês — por isso começam vazios.
function limparCamposConteudo() {
  CAMPOS_CONTEUDO.forEach((campo) => {
    document.getElementById(campo).value = "";
  });
}

async function salvarConteudo() {
  const dados = new FormData();
  dados.append("mes", getMesAtual());

  // só envia os campos preenchidos: um campo deixado em branco não apaga o que já
  // estava salvo para esse mês (útil já que os campos não são pré-carregados).
  CAMPOS_CONTEUDO.forEach((campo) => {
    const valor = document.getElementById(campo).value.trim();
    if (valor) dados.append(campo, valor);
  });

  const arquivoFoto = document.getElementById("foto").files[0];
  if (arquivoFoto) dados.append("foto", arquivoFoto);

  await fetch("/api/content", { method: "POST", body: dados });
}

formConteudo.addEventListener("submit", async (e) => {
  e.preventDefault();
  await salvarConteudo();
  conteudoStatus.textContent = "salvo ✓";
  setTimeout(() => (conteudoStatus.textContent = ""), 2000);
});

document.getElementById("btn-proximo-gerar").addEventListener("click", async () => {
  await salvarConteudo();
  irParaAba("gerar");
});

// ======================= GERAR =======================

const btnGerar = document.getElementById("btn-gerar");
const btnGerarTeste = document.getElementById("btn-gerar-teste");
const btnBaixarZip = document.getElementById("btn-baixar-zip");
const gerarStatus = document.getElementById("gerar-status");
const gerarResultados = document.getElementById("gerar-resultados");
const listaResultados = document.getElementById("lista-resultados");

async function gerarArtes(clientId, botao) {
  botao.disabled = true;
  gerarStatus.textContent = "Gerando artes, aguarde...";
  gerarResultados.style.display = "none";
  listaResultados.innerHTML = "";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: getMesAtual(), ...(clientId ? { clientId } : {}) }),
    });
    const resultados = await res.json();

    if (!res.ok) {
      gerarStatus.textContent = resultados.erro || "Erro ao gerar.";
      return;
    }

    gerarStatus.textContent = `${resultados.length} arte(s) processada(s).`;
    renderResultados(resultados);
  } catch (err) {
    gerarStatus.textContent = "Erro ao gerar as artes. Veja o terminal do servidor.";
  } finally {
    botao.disabled = false;
  }
}

btnGerar.addEventListener("click", () => gerarArtes(null, btnGerar));

btnGerarTeste.addEventListener("click", () => {
  const clienteId = dropdownClienteTeste.getValue();
  if (!clienteId) return;
  gerarArtes(clienteId, btnGerarTeste);
});

btnBaixarZip.addEventListener("click", () => {
  window.location.href = `/api/download-zip?mes=${encodeURIComponent(getMesAtual())}`;
});

function renderResultados(resultados) {
  listaResultados.innerHTML = "";
  resultados.forEach((r) => {
    const card = document.createElement("div");
    card.className = "resultado-card";

    if (r.erro) {
      card.innerHTML = `<div class="resultado-erro">${r.nome}: ${r.erro}</div>`;
    } else {
      const src = `/${r.imagem}?t=${Date.now()}`;
      card.innerHTML = `
        <div class="resultado-thumb"><img src="${src}" alt="${r.nome}"></div>
        <div class="resultado-info">
          <span class="resultado-nome">${r.nome}</span>
          <a class="link-download" href="/${r.imagem}" download>baixar png</a>
        </div>
      `;
      card.querySelector("img").addEventListener("click", () => abrirImagemModal(r.nome, src, `/${r.imagem}`));
    }
    listaResultados.appendChild(card);
  });
  gerarResultados.style.display = resultados.length ? "block" : "none";
}

// --- popup para visualizar a arte gerada em tela cheia ---
const imagemModalOverlay = document.getElementById("imagem-modal-overlay");
const imagemModalImg = document.getElementById("imagem-modal-img");
const imagemModalNome = document.getElementById("imagem-modal-nome");
const imagemModalDownload = document.getElementById("imagem-modal-download");
const imagemModalClose = document.getElementById("imagem-modal-close");

function abrirImagemModal(nome, src, downloadHref) {
  imagemModalImg.src = src;
  imagemModalNome.textContent = nome;
  imagemModalDownload.href = downloadHref;
  imagemModalOverlay.classList.add("active");
}

function fecharImagemModal() {
  imagemModalOverlay.classList.remove("active");
  imagemModalImg.src = "";
}

imagemModalClose.addEventListener("click", fecharImagemModal);
imagemModalOverlay.addEventListener("click", (e) => {
  if (e.target === imagemModalOverlay) fecharImagemModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharImagemModal();
});

// --- inicialização ---
setMesAtual(getMesAtual());
carregarClientes();
limparCamposConteudo();
