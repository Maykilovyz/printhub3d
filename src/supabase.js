// Conexão com o Supabase (banco de dados + armazenamento de arquivos).
// Usamos a chave SECRETA, por isso este arquivo só roda no servidor.
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_KEY;

if (!url || !chave) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY no arquivo .env");
  process.exit(1);
}

const supabase = createClient(url, chave, {
  auth: { persistSession: false },
});

module.exports = supabase;
