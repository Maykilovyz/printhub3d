// =============================================================
// Página de entrada: login com Google (e login de teste).
// =============================================================
const erro = document.querySelector("#erro");
const botaoGoogle = document.querySelector("#google");

// Se já estiver logado, vai direto para o painel certo
if (sessao.token()) irParaPainel(sessao.usuario());

// Erro de rede (sem internet / servidor fora) vira uma frase clara em português
const mensagemDeErro = (e) => (e instanceof TypeError ? "Sem conexão com o servidor. Confira a internet e tente de novo." : e.message);

let clienteSupabase = null;
let googleClientId = null; // usado só no app Android

// 1) Pega a URL e a chave PÚBLICA do Supabase no nosso servidor
async function prepararGoogle() {
  const cfg = await fetch(SERVIDOR + "/api/config").then((r) => r.json());
  if (!cfg.supabaseChavePublica) {
    botaoGoogle.disabled = true;
    erro.textContent = "Login com Google ainda não configurado (falta SUPABASE_PUBLISHABLE_KEY no .env).";
    return;
  }
  googleClientId = cfg.googleClientId;
  // "supabase" aqui é a biblioteca carregada pelo <script> do CDN
  clienteSupabase = supabase.createClient(cfg.supabaseUrl, cfg.supabaseChavePublica, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  // 2) Voltando do Google? A biblioteca já leu o código da URL e criou a sessão.
  const { data } = await clienteSupabase.auth.getSession();
  if (data.session) await trocarPorTokenDoSite(data.session.access_token);
}

// 3) Manda o token do Google/Supabase para o nosso servidor e recebe o nosso
async function trocarPorTokenDoSite(accessToken) {
  botaoGoogle.disabled = true;
  botaoGoogle.querySelector("span").textContent = "Entrando…";
  try {
    const r = await fetch(SERVIDOR + "/api/usuarios/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro);
    // Não precisamos mais da sessão do Supabase no navegador
    await clienteSupabase.auth.signOut({ scope: "local" });
    sessao.salvar(dados.token, dados.usuario);
    irParaPainel(dados.usuario);
  } catch (e) {
    erro.textContent = mensagemDeErro(e);
    botaoGoogle.disabled = false;
    botaoGoogle.querySelector("span").textContent = "Entrar com Google";
  }
}

// ---------- Login no app Android ----------
// O Google não deixa fazer login dentro de um app (WebView). Por isso, no app,
// usamos o login NATIVO do Android (plugin @capgo/capacitor-social-login):
// abre a janelinha de escolher conta e devolve um "idToken" do Google.
// Depois entregamos esse idToken ao Supabase e seguimos igual ao site.

// Resumo SHA-256 em hexadecimal (o Google recebe o nonce resumido)
async function sha256(texto) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function entrarComGoogleNoApp() {
  if (!googleClientId) throw new Error("Login do app não configurado (falta GOOGLE_WEB_CLIENT_ID no servidor).");
  // Chamamos o plugin nativo direto pela "ponte" do Capacitor (nome do plugin + método)
  const SocialLogin = {
    initialize: (opcoes) => window.Capacitor.nativePromise("SocialLogin", "initialize", opcoes),
    login: (opcoes) => window.Capacitor.nativePromise("SocialLogin", "login", opcoes),
  };
  await SocialLogin.initialize({ google: { webClientId: googleClientId } });

  // "nonce" é um número aleatório de uso único: impede que alguém reaproveite um token antigo.
  // O Google recebe a versão resumida; o Supabase recebe a original e confere se batem.
  const nonce = crypto.randomUUID();
  const resposta = await SocialLogin.login({ provider: "google", options: { nonce: await sha256(nonce) } });

  const { data, error } = await clienteSupabase.auth.signInWithIdToken({
    provider: "google",
    token: resposta.result.idToken,
    nonce,
  });
  if (error) throw error;
  await trocarPorTokenDoSite(data.session.access_token);
}

// Clique no botão: vai para a tela do Google
botaoGoogle.onclick = async () => {
  erro.textContent = "";
  if (NO_APP) {
    return entrarComGoogleNoApp().catch((e) => {
      // Fechar a janelinha sem escolher conta não é erro de verdade
      if (!/cancel/i.test(e.message)) erro.textContent = "Não foi possível entrar com o Google: " + e.message;
    });
  }
  const { error } = await clienteSupabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + "/", queryParams: { prompt: "select_account" } },
  });
  if (error) erro.textContent = "Não foi possível abrir o Google: " + error.message;
};

// Login das contas de teste (e-mail e senha)
document.querySelector("#form-teste").onsubmit = async (e) => {
  e.preventDefault();
  erro.textContent = "";
  try {
    const r = await fetch(SERVIDOR + "/api/usuarios/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.querySelector("#t-email").value,
        senha: document.querySelector("#t-senha").value,
      }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro);
    sessao.salvar(dados.token, dados.usuario);
    irParaPainel(dados.usuario);
  } catch (err) { erro.textContent = mensagemDeErro(err); }
};

prepararGoogle().catch(() => (erro.textContent = "Não foi possível carregar o login. Recarregue a página."));
