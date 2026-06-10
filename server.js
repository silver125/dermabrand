require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();

// ── Segurança: headers HTTP via Helmet ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // CSP gerenciado pelo Vercel/CDN
  crossOriginEmbedderPolicy: false,
}));

// ── CORS: aceitar apenas o domínio de produção e localhost ─────────────────────
const allowedOrigins = [
  'https://dermabrand.com.br',
  'https://www.dermabrand.com.br',
  /\.vercel\.app$/,
  /^http:\/\/localhost/,
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Vercel serverless / curl
    const ok = allowedOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin));
    cb(ok ? null : new Error('CORS não permitido'), ok);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// ── Limite de tamanho de payload (evitar ataques de payload gigante) ─────────
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting por endpoint ───────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento e tente novamente.' },
});
const leadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de cadastro. Aguarde um momento.' },
});
app.use('/api/analyze', apiLimiter);
app.use('/api/trends', apiLimiter);
app.use('/api/profile', apiLimiter);
app.use('/api/lead', leadLimiter);

// ── Variáveis de ambiente ──────────────────────────────────────────────
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '0e22bdfa13msh0e3e0fcbe1c11fdp128553jsn968d0eb71654';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-20251.p.rapidapi.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Configuração do transporte de e-mail (Gmail SMTP via App Password ou variável de ambiente)
function createMailTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER || 'dermabrandinfo@gmail.com',
      pass: process.env.MAIL_PASS || '',
    },
  });
}

// ── GET /api/profile?username=xxx ─────────────────────────────────────────────
// Helper: sanitizar string (strip tags, trim, limitar tamanho)
function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

app.get('/api/profile', async (req, res) => {
  const raw = req.query.username;
  if (!raw) return res.status(400).json({ error: 'username obrigatório' });
  // Aceitar apenas caracteres válidos de username do Instagram
  const username = raw.replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
  if (!username) return res.status(400).json({ error: 'Username inválido.' });

  try {
    const response = await fetch(
      `https://instagram120.p.rapidapi.com/api/instagram/profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'instagram120.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
        body: JSON.stringify({ username })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `RapidAPI erro ${response.status}`, detail: text });
    }

    const data = await response.json();
    
    // A API instagram120 devolve os dados dentro de 'result'
    let user = data?.result || data?.data?.user || data?.user || data?.data || data;

    if (!user || (!user.username && !user.full_name)) {
      return res.status(404).json({ error: 'Perfil não encontrado ou privado.' });
    }

    // Normalizar a contagem de seguidores para o frontend (que espera follower_count)
    if (user.edge_followed_by && typeof user.edge_followed_by.count !== 'undefined') {
      user.follower_count = user.edge_followed_by.count;
    }

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar perfil', detail: err.message });
  }
});

// ── POST /api/analyze ─────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { profile } = req.body;
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'Dados do perfil obrigatórios' });

  const full_name    = sanitize(profile.full_name, 100);
  const username     = sanitize(profile.username, 30).replace(/[^a-zA-Z0-9._]/g, '');
  const specialty    = sanitize(profile.specialty, 80);
  const city         = sanitize(profile.city, 80);
  const biography    = sanitize(profile.biography, 300);
  const follower_count = sanitize(String(profile.follower_count || ''), 20);
  const likes        = sanitize(String(profile.likes || ''), 30);
  const comments     = sanitize(String(profile.comments || ''), 20);
  const frequency    = sanitize(profile.frequency, 50);
  const captions     = sanitize(profile.captions, 400);
  const observations = sanitize(profile.observations, 400);
  const contentTypes = Array.isArray(profile.contentTypes)
    ? profile.contentTypes.map(t => sanitize(t, 40)).slice(0, 10)
    : (Array.isArray(req.body.contentTypes) ? req.body.contentTypes.map(t => sanitize(t, 40)).slice(0, 10) : []);

  const prompt = `Você é um especialista em branding premium para saúde, posicionamento digital e comunicação ética para diferentes perfis do ecossistema médico no Brasil.

Sua primeira tarefa é identificar, pelos dados informados, se o perfil representa um profissional de saúde, uma clínica, uma agência de marketing médico, uma consultoria, um serviço B2B para médicos ou outra especialidade/segmento. Nunca assuma dermatologia, médica ou dermatologista por padrão.

Sua análise deve ser técnica, especializada e orientada ao objetivo adequado ao tipo de perfil: atração de pacientes particulares quando for perfil assistencial, fortalecimento institucional quando for clínica, ou geração de autoridade e demanda B2B quando for marketing médico, consultoria ou serviço para profissionais de saúde. Escreva como uma agência de marketing médico premium que entende que o diagnóstico gratuito é a primeira etapa de uma conversa comercial consultiva: entregue valor real, evidencie lacunas estratégicas e conduza o leitor para perceber que existe um próximo nível de planejamento com especialistas.

Analise os dados abaixo com rigor profissional e gere um diagnóstico estratégico completo, adaptado à especialidade, ao segmento e ao público-alvo identificados.

DADOS DO PERFIL:
- Nome: ${full_name || 'Não informado'}
- @username: @${username || 'Não informado'}
- Especialidade: ${specialty || 'Não informada'}
- Cidade: ${city || 'Não informada'}
- Bio: ${biography || 'Não informada'}
- Número de seguidores: ${follower_count || 'Não informado'}
- Média de curtidas: ${likes || 'Não informada'}
- Média de comentários: ${comments || 'Não informada'}
- Frequência de posts: ${frequency || 'Não informada'}
- Tipos de conteúdo (ex: reels, antes/depois, educativo, lifestyle): ${contentTypes && contentTypes.length > 0 ? contentTypes.join(', ') : 'Não informado'}
- Exemplos de legendas: ${captions || 'Não informado'}
- Observações gerais: ${observations || 'Nenhuma'}

---

ESTRUTURA DA RESPOSTA (exatamente 6 seções, cada uma objetiva e sem repetição entre elas):

1. NOTAS DO DIAGNÓSTICO
Retorne as três notas somente aqui, no formato exato:
Score de Autoridade: X/10
Score de Bio e Posicionamento: X/10
Score de Conteúdo e Engajamento: X/10

Em seguida, 2 frases justificando os scores. Seja direto: cite o fator principal que elevou e o principal que reduziu cada nota. Não repita os critérios nas seções seguintes.

Critérios (use internamente, não repita no texto):
- Autoridade: expertise percebida, diferenciação, consistência de imagem.
- Bio: clareza de área, público, diferencial, CTA sóbrio.
- Conteúdo: consistência editorial, qualidade, engajamento real.

---

2. POSICIONAMENTO E AUTORIDADE
Nível: Baixo / Médio / Alto.
3 a 4 frases: o que transmite autoridade hoje e o principal gap. Sem notas numéricas. Sem repetir o que foi dito em "1".

---

3. ANÁLISE DA BIO
Identifique o tipo de perfil (profissional, clínica, agência, B2B). Avalie em 3 frases: clareza, credibilidade e oportunidade principal.
Sugira uma BIO otimizada (máx 150 caracteres), sóbria, sem emojis, sem promessas genéricas, adaptada ao tipo de perfil.

---

4. ANÁLISE DE CONTEÚDO E ENGAJAMENTO
Em 4 a 5 frases: qualidade percebida, adequação ao público correto, taxa de engajamento estimada e potencial de crescimento. Aponte 1 ponto forte e 1 lacuna crítica. Seja específico, use os dados informados.

---

5. ERROS E GARGALOS
Liste de 3 a 4 erros estratégicos objetivos que impedem crescimento ou conversão. Cada item em 1 frase acionável. Sem repetição do que foi dito nas seções anteriores.

---

6. PLANO DE MELHORIA (EXECUTIVO)
Apresente em formato conciso:
- **Próximas 2 semanas**: 2 ações de impacto imediato
- **Conteúdo a priorizar**: 2 formatos ou temas específicos
- **Frequência**: postagens por semana recomendadas
- **Diferencial**: 1 frase sobre como se destacar no segmento
- **Próximo passo**: em tom consultivo, por que um plano com especialistas da Dermabrand aprofunda o que o diagnóstico identificou.

Seja direto. Cada item em 1 a 2 frases. Sem repetição de pontos já citados.

---

REGRAS:
- Linguagem sofisticada, técnica, sóbria e compatível com a credibilidade exigida no mercado de saúde.
- Nunca use emojis, ícones decorativos, símbolos chamativos ou linguagem de influenciador.
- Evitar clichês, generalizações, promessas de resultado, sensacionalismo e ofertas agressivas.
- Foco em diagnóstico estratégico com intenção comercial consultiva: a pessoa deve sentir que recebeu valor, mas que o próximo passo com a Dermabrand pode aprofundar método, plano de ação e execução.
- Pensar como especialista em branding premium para saúde, respeitando a seriedade da comunicação no setor.
- Seja conciso e acionável.
- Use dados para sustentar cada recomendação.
- Não mencione consultas médicas gratuitas, descontos, garantias de resultado ou chamadas comerciais agressivas. Pode mencionar uma conversa com especialistas da Dermabrand como próximo passo estratégico para transformar o diagnóstico em plano de marca, conteúdo e conversão.
- A análise de BIO deve ser profunda, especializada e crítica; explique exatamente por que a bio atual transmite ou não autoridade.
- A sugestão de bio deve ser adequada ao tipo de perfil identificado. Se for marketing médico, agência, consultoria ou serviço B2B, não escreva como se fosse médica, médico, dermatologista ou clínica assistencial. Se for profissional ou clínica, respeite a especialidade informada. Em todos os casos, sem emoji, sem sensacionalismo, sem promessas e sem termos genéricos como “transformando vidas”, “resultados que falam”, “excelência” ou “inovação e cuidado” quando não houver evidência.
- As três notas devem ser realistas, rigorosas e justificáveis; evite notas infladas sem evidência e explique os critérios usados de forma compreensível para o usuário final.
- Não repita notas numéricas fora da seção “1. NOTAS DO DIAGNÓSTICO”. Em “Posicionamento e Autoridade” e nas demais seções, escreva apenas análise qualitativa.
- Nunca use visualização circular, gráfico ou termos técnicos de interface no texto; apenas entregue os scores no formato solicitado.
- O texto deve soar como uma agência de marketing médico de altíssimo nível: preciso, bonito, persuasivo, premium e voltado à geração de lead qualificado, sem parecer apelativo.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    if (!text) return res.status(500).json({ error: 'IA não retornou análise', detail: data });

    return res.json({ ok: true, report: text });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar análise', detail: err.message });
  }
});

// ── Calendário sazonal brasileiro para saúde ────────────────────────────────────────────
const SEASONAL_CALENDAR = [
  // Janeiro
  { month: 1, day: 1,  label: 'Ano Novo — Metas de Saúde e Bem-estar', tags: ['bem-estar','saúde mental','nutrologia','endocrinologia','dermatologia','medicina esportiva','psicologia'] },
  { month: 1, day: 17, label: 'Dia Nacional de Combate à Hansenaníase', tags: ['dermatologia','infectologia','saúde pública'] },
  { month: 1, day: 20, label: 'Janeiro Branco — Saúde Mental e Emocional', tags: ['psiquiatria','psicologia','saúde mental','bem-estar','neurologia'] },
  { month: 1, day: 22, label: 'Dia Nacional do Cego (Oftalmologia Preventiva)', tags: ['oftalmologia','saúde pública','geriatria'] },
  { month: 1, day: 27, label: 'Dia Nacional de Combate ao Câncer de Cabeça e Pescoço', tags: ['oncologia','otorrinolaringologia','cirurgia plástica','dermatologia'] },
  { month: 1, day: 31, label: 'Fim do Verão — Cuidados com a Pele após Exposição Solar', tags: ['dermatologia','fotoproteção','estética','nutrição'] },
  // Fevereiro
  { month: 2, day: 4,  label: 'Dia Mundial do Câncer', tags: ['oncologia','dermatologia','ginecologia','urologia','mastologia','nutrição'] },
  { month: 2, day: 5,  label: 'Dia Mundial do Câncer de Intestino', tags: ['gastroenterologia','oncologia','nutrição','cirurgia'] },
  { month: 2, day: 14, label: 'Dia dos Namorados (EUA/Internacional)', tags: ['saúde sexual','ginecologia','urologia','dermatologia','bem-estar','psicologia'] },
  { month: 2, day: 28, label: 'Dia das Doenças Raras', tags: ['genética','neurologia','reumatologia','imunologia','pediatria'] },
  // Março
  { month: 3, day: 1,  label: 'Março Lilás — Câncer de Colo de Útero (mês inteiro)', tags: ['ginecologia','oncologia','saúde feminina','infectologia','mastologia'] },
  { month: 3, day: 4,  label: 'Dia Mundial da Obesidade', tags: ['endocrinologia','nutrologia','nutrição','cirurgia bariátrica','cardiologia'] },
  { month: 3, day: 8,  label: 'Dia Internacional da Mulher', tags: ['saúde feminina','ginecologia','mastologia','dermatologia','nutrição','psicologia'] },
  { month: 3, day: 15, label: 'Dia Mundial do Rim', tags: ['nefrologia','clínica médica','nutrição','urologia','endocrinologia'] },
  { month: 3, day: 21, label: 'Dia Mundial da Síndrome de Down', tags: ['genética','neurologia','pediatria','psicologia','fonoaudiologia'] },
  { month: 3, day: 21, label: 'Início do Outono — Transição de Estação', tags: ['dermatologia','nutrição','imunologia','reumatologia','pneumologia'] },
  { month: 3, day: 22, label: 'Dia Mundial da Água — Hidratação e Saúde', tags: ['nutrição','nefrologia','dermatologia','endocrinologia'] },
  { month: 3, day: 24, label: 'Dia Mundial da Tuberculose', tags: ['infectologia','pneumologia','saúde pública','imunologia'] },
  { month: 3, day: 26, label: 'Dia Nacional de Combate à Hipertensão', tags: ['cardiologia','clínica médica','nutrição','nefrologia'] },
  // Abril
  { month: 4, day: 2,  label: 'Abril Azul — Dia Mundial do Autismo', tags: ['neurologia','pediatria','psiquiatria','psicologia','fonoaudiologia'] },
  { month: 4, day: 7,  label: 'Dia Mundial da Saúde', tags: ['saúde pública','prevenção','todos os especialistas','marketing médico'] },
  { month: 4, day: 11, label: 'Dia Mundial do Parkinson', tags: ['neurologia','geriatria','fisioterapia','nutrição','psicologia'] },
  { month: 4, day: 17, label: 'Dia Nacional de Combate à Hipertensão', tags: ['cardiologia','clínica médica','nutrição','nefrologia'] },
  { month: 4, day: 28, label: 'Dia Mundial da Saúde e Segurança no Trabalho', tags: ['medicina do trabalho','ortopedia','saúde mental','fisioterapia'] },
  // Maio
  { month: 5, day: 5,  label: 'Dia Mundial da Higiene das Mãos', tags: ['infectologia','saúde pública','dermatologia','pediatria'] },
  { month: 5, day: 11, label: 'Dia Nacional de Prevenção da Obesidade', tags: ['endocrinologia','nutrologia','cirurgia bariátrica','nutrição','cardiologia'] },
  { month: 5, day: 12, label: 'Dia das Mães', tags: ['saúde feminina','ginecologia','dermatologia','nutrição','bem-estar','psicologia','cirurgia plástica'] },
  { month: 5, day: 17, label: 'Dia Mundial da Hipertensão', tags: ['cardiologia','clínica médica','nutrição','nefrologia','endocrinologia'] },
  { month: 5, day: 19, label: 'Dia Nacional de Combate à Hepatite', tags: ['gastroenterologia','infectologia','hepatologia','nutrição'] },
  { month: 5, day: 22, label: 'Dia Mundial da Esclerose Múltipla', tags: ['neurologia','imunologia','fisioterapia','nutrição'] },
  { month: 5, day: 25, label: 'Dia Nacional de Prevenção da Hipertensão', tags: ['cardiologia','nutrição','clínica médica'] },
  { month: 5, day: 28, label: 'Dia Internacional da Saúde da Mulher', tags: ['ginecologia','saúde feminina','mastologia','endocrinologia','nutrição'] },
  { month: 5, day: 31, label: 'Dia Mundial Sem Tabaco', tags: ['pneumologia','cardiologia','oncologia','dermatologia','saúde mental'] },
  // Junho
  { month: 6, day: 6,  label: 'Dia Nacional de Doação de Sangue', tags: ['hematologia','saúde pública','cirurgia','oncologia'] },
  { month: 6, day: 12, label: 'Dia dos Namorados (Brasil)', tags: ['saúde sexual','dermatologia','ginecologia','urologia','bem-estar','psicologia','cirurgia plástica'] },
  { month: 6, day: 14, label: 'Dia Mundial do Doador de Sangue', tags: ['hematologia','saúde pública','oncologia','cirurgia'] },
  { month: 6, day: 21, label: 'Início do Inverno — Cuidados Sazonais', tags: ['dermatologia','pneumologia','imunologia','nutrição','reumatologia','ortopedia','alergologia'] },
  { month: 6, day: 24, label: 'Dia Nacional da Fisioterapia', tags: ['fisioterapia','ortopedia','neurologia','medicina esportiva','reumatologia'] },
  { month: 6, day: 26, label: 'Dia Internacional de Combate às Drogas', tags: ['psiquiatria','saúde mental','saúde pública','neurologia'] },
  { month: 6, day: 27, label: 'Dia Nacional de Combate ao Diabetes', tags: ['endocrinologia','nutrologia','nutrição','oftalmologia','cardiologia'] },
  // Julho
  { month: 7, day: 4,  label: 'Dia Nacional de Controle da Asma', tags: ['pneumologia','alergologia','pediatria','imunologia'] },
  { month: 7, day: 14, label: 'Dia Nacional de Prevenção do Câncer de Cabeça e Pescoço', tags: ['oncologia','otorrinolaringologia','cirurgia plástica','dermatologia'] },
  { month: 7, day: 20, label: 'Dia do Amigo — Saúde das Relações', tags: ['saúde mental','psicologia','psiquiatria','bem-estar'] },
  { month: 7, day: 28, label: 'Dia Mundial da Hepatite', tags: ['gastroenterologia','infectologia','hepatologia','nutrição'] },
  // Agosto
  { month: 8, day: 1,  label: 'Agosto Dourado — Aleitamento Materno (mês inteiro)', tags: ['pediatria','ginecologia','nutrologia','obstetrícia','nutrição'] },
  { month: 8, day: 9,  label: 'Dia Nacional de Combate ao Fumo', tags: ['pneumologia','cardiologia','oncologia','dermatologia','saúde mental'] },
  { month: 8, day: 13, label: 'Dia dos Pais', tags: ['saúde masculina','urologia','cardiologia','nutrição','bem-estar','psicologia','medicina esportiva'] },
  { month: 8, day: 26, label: 'Dia Nacional de Doação de Órgãos', tags: ['cirurgia','saúde pública','nefrologia','cardiologia','hepatologia'] },
  // Setembro
  { month: 9, day: 1,  label: 'Setembro Amarelo — Prevenção ao Suicídio (mês inteiro)', tags: ['psiquiatria','psicologia','saúde mental','neurologia','bem-estar'] },
  { month: 9, day: 10, label: 'Dia Mundial de Prevenção ao Suicídio', tags: ['psiquiatria','saúde mental','neurologia','psicologia'] },
  { month: 9, day: 13, label: 'Dia do Nutricionista', tags: ['nutrição','nutrologia','endocrinologia','gastroenterologia','medicina esportiva'] },
  { month: 9, day: 15, label: 'Dia Nacional de Combate ao Colesterol', tags: ['cardiologia','nutrição','endocrinologia','clínica médica','nefrologia'] },
  { month: 9, day: 21, label: 'Dia Mundial do Alzheimer', tags: ['neurologia','geriatria','psiquiatria','nutrição','fisioterapia'] },
  { month: 9, day: 22, label: 'Início da Primavera — Alergias e Pele', tags: ['dermatologia','alergologia','nutrição','oftalmologia','medicina esportiva'] },
  { month: 9, day: 26, label: 'Dia Nacional de Prevenção do Câncer de Tireoide', tags: ['endocrinologia','oncologia','cirurgia','nutrição'] },
  { month: 9, day: 29, label: 'Dia Mundial do Coração', tags: ['cardiologia','clínica médica','nutrição','medicina esportiva','fisioterapia'] },
  // Outubro
  { month: 10, day: 1,  label: 'Dia Internacional do Idoso', tags: ['geriatria','cardiologia','ortopedia','nutrição','neurologia','fisioterapia'] },
  { month: 10, day: 2,  label: 'Outubro Rosa — Câncer de Mama (mês inteiro)', tags: ['mastologia','ginecologia','oncologia','dermatologia','nutrição','saúde feminina'] },
  { month: 10, day: 10, label: 'Dia Mundial da Saúde Mental', tags: ['psiquiatria','psicologia','saúde mental','neurologia','bem-estar'] },
  { month: 10, day: 12, label: 'Dia das Crianças', tags: ['pediatria','nutrição','dermatologia','odontologia','psicologia'] },
  { month: 10, day: 15, label: 'Dia do Médico', tags: ['todos os especialistas','branding médico','marketing médico'] },
  { month: 10, day: 16, label: 'Dia Mundial da Alimentação', tags: ['nutrologia','nutrição','endocrinologia','gastroenterologia','saúde pública'] },
  { month: 10, day: 20, label: 'Dia Mundial da Osteoporose', tags: ['ortopedia','reumatologia','endocrinologia','nutrição','geriatria'] },
  { month: 10, day: 22, label: 'Dia do Médico (alternativo)', tags: ['todos os especialistas','marketing médico','branding médico'] },
  { month: 10, day: 29, label: 'Dia Mundial do AVC', tags: ['neurologia','cardiologia','clínica médica','fisioterapia','nutrição'] },
  { month: 10, day: 31, label: 'Halloween (Tendências de beleza e pele)', tags: ['dermatologia','cirurgia plástica','estética','odontologia'] },
  // Novembro
  { month: 11, day: 1,  label: 'Novembro Azul — Saúde Masculina e Próstata (mês inteiro)', tags: ['urologia','andrologia','cardiologia','saúde masculina','oncologia','nutrição'] },
  { month: 11, day: 7,  label: 'Dia Nacional de Combate ao Câncer de Pulmão', tags: ['pneumologia','oncologia','cardiologia','cirurgia'] },
  { month: 11, day: 12, label: 'Dia Mundial da Pneumonia', tags: ['pneumologia','infectologia','pediatria','imunologia'] },
  { month: 11, day: 14, label: 'Dia Mundial do Diabetes', tags: ['endocrinologia','nutrologia','nutrição','clínica médica','oftalmologia','cardiologia'] },
  { month: 11, day: 17, label: 'Dia Nacional do Prematuro', tags: ['pediatria','neonatologia','obstetrícia','nutrição'] },
  { month: 11, day: 20, label: 'Dia da Consciência Negra (Saúde da População Negra)', tags: ['dermatologia','saúde pública','hematologia','nutrição','ginecologia'] },
  { month: 11, day: 25, label: 'Dia Internacional de Eliminação da Violência contra a Mulher', tags: ['saúde feminina','psiquiatria','psicologia','saúde pública','ginecologia'] },
  { month: 11, day: 29, label: 'Black Friday (Procedimentos Estéticos e Bem-estar)', tags: ['dermatologia','cirurgia plástica','estética','odontologia','nutrição'] },
  // Dezembro
  { month: 12, day: 1,  label: 'Dia Mundial de Combate à AIDS (Dezembro Vermelho)', tags: ['infectologia','ginecologia','saúde sexual','dermatologia','urologia','imunologia'] },
  { month: 12, day: 3,  label: 'Dia Internacional das Pessoas com Deficiência', tags: ['ortopedia','neurologia','fisioterapia','saúde pública','psicologia'] },
  { month: 12, day: 5,  label: 'Dia do Cirurgião Plástico', tags: ['cirurgia plástica','estética','dermatologia','marketing médico'] },
  { month: 12, day: 9,  label: 'Dia Nacional de Combate à Corrupção (Transparência em Saúde)', tags: ['saúde pública','marketing médico'] },
  { month: 12, day: 10, label: 'Dia dos Direitos Humanos (Acesso Universal à Saúde)', tags: ['saúde pública','medicina preventiva','marketing médico'] },
  { month: 12, day: 21, label: 'Início do Verão', tags: ['dermatologia','fotoproteção','nutrição','cirurgia plástica','estética','medicina esportiva'] },
  { month: 12, day: 25, label: 'Natal (Bem-estar e Alimentação nas Festas)', tags: ['nutrologia','nutrição','endocrinologia','saúde mental','bem-estar','dermatologia','psicologia'] },
  { month: 12, day: 31, label: 'Réveillon (Metas de Saúde para o Novo Ano)', tags: ['bem-estar','saúde mental','nutrologia','dermatologia','medicina esportiva','endocrinologia','psicologia'] },
];

// Eventos especiais de saúde e datas de alto impacto editorial
const SPECIAL_EVENTS = [
  // Copa do Mundo FIFA 2026 — oportunidade para conteúdo de saúde esportiva e prevenção
  { from: '2026-06-11', to: '2026-07-19', label: 'Copa do Mundo FIFA 2026 — Saúde Esportiva e Prevenção de Lesões', tags: ['medicina esportiva','ortopedia','nutrição','cardiologia','fisioterapia'] },
  // Carnaval — cuidados com pele, saúde sexual e imunidade
  { from: '2026-02-14', to: '2026-02-17', label: 'Carnaval — Cuidados com a Pele, Imunidade e Saúde Sexual', tags: ['dermatologia','infectologia','saúde sexual','nutrição','imunologia'] },
  // Férias de julho — viagens, saúde infantil, exposição solar
  { from: '2026-07-01', to: '2026-07-31', label: 'Férias de Julho — Saúde nas Viagens e Cuidados Infantis', tags: ['infectologia','pediatria','dermatologia','nutrição','ortopedia'] },
  // Volta às aulas — imunização, saúde bucal, nutrição infantil
  { from: '2026-01-26', to: '2026-02-10', label: 'Volta às Aulas — Imunização, Saúde Bucal e Nutrição Infantil', tags: ['pediatria','infectologia','nutrição','odontologia','saúde mental'] },
  { from: '2026-07-27', to: '2026-08-10', label: 'Volta às Aulas (2º semestre) — Imunização e Saúde Infantil', tags: ['pediatria','infectologia','nutrição','odontologia','saúde mental'] },
];

function getUpcomingSeasonalContext(referenceDate) {
  const now = referenceDate || new Date();
  // Usar fuso horário de Brasília (UTC-3)
  const brtOffset = -3 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brt = new Date(utc + brtOffset * 60000);

  const todayMonth = brt.getMonth() + 1;
  const todayDay = brt.getDate();
  const todayYear = brt.getFullYear();

  // Formatar data atual em português
  const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const todayStr = `${todayDay} de ${months[todayMonth - 1]} de ${todayYear}`;

  // Calcular dias até cada data do calendário (próximos 60 dias)
  const upcoming = [];

  for (const event of SEASONAL_CALENDAR) {
    let eventYear = todayYear;
    let eventDate = new Date(eventYear, event.month - 1, event.day);
    if (eventDate < brt) {
      eventYear += 1;
      eventDate = new Date(eventYear, event.month - 1, event.day);
    }
    const diffMs = eventDate - brt;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 60) {
      upcoming.push({ ...event, diffDays, eventYear, dateStr: `${event.day}/${event.month < 10 ? '0' + event.month : event.month}` });
    }
  }

  // Verificar eventos especiais ativos ou próximos
  const activeSpecial = [];
  for (const ev of SPECIAL_EVENTS) {
    const from = new Date(ev.from);
    const to = new Date(ev.to);
    const diffStart = Math.ceil((from - brt) / (1000 * 60 * 60 * 24));
    const diffEnd = Math.ceil((to - brt) / (1000 * 60 * 60 * 24));
    if (diffEnd >= 0 && diffStart <= 60) {
      const status = diffStart <= 0 ? 'em andamento' : `em ${diffStart} dias`;
      activeSpecial.push({ label: ev.label, tags: ev.tags, status });
    }
  }

  // Ordenar por proximidade e pegar os 5 mais próximos
  upcoming.sort((a, b) => a.diffDays - b.diffDays);
  const top5 = upcoming.slice(0, 5);

  return { todayStr, upcoming: top5, specialEvents: activeSpecial };
}

// ── POST /api/trends ─────────────────────────────────────────────────────────
// Recebe { specialty, category, username } e retorna pautas sazonais por formato.
app.post('/api/trends', async (req, res) => {
  const specialty = sanitize(req.body.specialty, 80);
  const category  = sanitize(req.body.category, 80);
  const username  = sanitize(req.body.username, 30).replace(/[^a-zA-Z0-9._]/g, '');
  const areaLabel = specialty || category || 'saúde';

  const { todayStr, upcoming, specialEvents } = getUpcomingSeasonalContext();

  // Montar contexto sazonal para o prompt
  let seasonalContext = `Data de hoje (Brasília): ${todayStr}\n`;

  if (specialEvents.length > 0) {
    seasonalContext += `\nEventos especiais relevantes agora:\n`;
    specialEvents.forEach(ev => {
      seasonalContext += `- ${ev.label} (${ev.status}) — áreas: ${ev.tags.join(', ')}\n`;
    });
  }

  if (upcoming.length > 0) {
    seasonalContext += `\nPróximas datas comemorativas e campanhas de saúde (até 60 dias):\n`;
    upcoming.forEach(ev => {
      const when = ev.diffDays === 0 ? 'hoje' : ev.diffDays === 1 ? 'amanhã' : `em ${ev.diffDays} dias (${ev.dateStr})`;
      seasonalContext += `- ${ev.label} — ${when} — áreas relacionadas: ${ev.tags.join(', ')}\n`;
    });
  } else {
    seasonalContext += `\nNão há datas comemorativas específicas nos próximos 60 dias, mas considere a estação do ano e o contexto geral de saúde.\n`;
  }

  const prompt = `Você é especialista em estratégia de conteúdo para profissionais e clínicas de saúde no Instagram brasileiro.

ESPECIALIDADE DO PROFISSIONAL: ${areaLabel}

Sua tarefa é gerar exatamente 3 sugestões de pauta EXCLUSIVAMENTE sobre ${areaLabel}. Todo o conteúdo deve ser específico desta especialidade — termos clínicos, procedimentos, dúvidas e público-alvo típicos de ${areaLabel}. Não gere pautas genéricas de saúde que qualquer especialidade poderia usar.

Use as datas sazonais abaixo como GANCHO EDITORIAL para criar pautas de ${areaLabel}. Cada pauta deve conectar uma data real com um tema específico da especialidade.

${seasonalContext}

Instrucões:
1. Para cada uma das 3 datas mais próximas, crie uma pauta sobre um tema real de ${areaLabel} que se conecte com aquela data.
2. O tema, o título, o gancho e o ângulo devem ser sobre ${areaLabel} — a data é apenas o gatilho de oportunidade.
3. Exemplos do nível de especificidade esperado:
   - Dermatologia: fotoproteção, acne, manchas, botox, peeling, skincare, rosácea, dermatite
   - Nutrição: microbiota, resistência à insulina, jejum intermitente, suplementação, emagrecimento
   - Cardiologia: pressão arterial, colesterol, infarto, arritmia, exames preventivos
   - Ortopedia: coluna, joelho, postura, lesões esportivas, osteoporose
   - Ginecologia: ciclo menstrual, menopausa, HPV, pré-natal, saúde hormonal
4. Informe sempre qual data/evento motivou cada pauta no campo "gatilho".

Regras de qualidade:
- Linguagem sóbria, técnica e premium — sem emojis, sem sensacionalismo, sem promessas de resultado
- Pautas éticas, compatíveis com o CFM e com a comunicação médica responsável
- Foco em educação, autoridade e conexão com o público correto da especialidade
- Cada sugestão deve ter: título da pauta (máx 12 palavras), gancho de abertura (1 frase) e ângulo estratégico (1 frase)
- Não repita datas entre os 3 blocos
- NUNCA gere pauta genérica — se não souber a especialidade, use saúde geral mas sinalize no campo "area"

Responda EXCLUSIVAMENTE em JSON válido, sem markdown, sem texto fora do JSON, no formato exato:
{
  "area": "<área identificada>",
  "trends": [
    {
      "tema": "<título do tema>",
      "gatilho": "<nome da data ou evento que motivou esta pauta>",
      "gatilho_data": "<data no formato DD/MM ou descrição como 'em andamento'>",
      "reels": {
        "titulo": "<título da pauta para Reels>",
        "gancho": "<frase de abertura>",
        "angulo": "<ângulo estratégico>"
      },
      "carrossel": {
        "titulo": "<título da pauta para Carrossel>",
        "gancho": "<frase de abertura>",
        "angulo": "<ângulo estratégico>"
      }
    }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'IA retornou JSON inválido', raw });
    }

    return res.json({ ok: true, ...parsed });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar trends', detail: err.message });
  }
});

// ── POST /api/lead ────────────────────────────────────────────────────────────
// Recebe dados do lead (nome, email, whatsapp, area) e envia e-mail para a agência
app.post('/api/lead', async (req, res) => {
  const nome     = sanitize(req.body.nome, 100);
  const email    = sanitize(req.body.email, 150).toLowerCase();
  const whatsapp = sanitize(req.body.whatsapp, 20).replace(/[^0-9()+\- ]/g, '');
  const area     = sanitize(req.body.area, 80);

  if (!nome || !email || !whatsapp || !area) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  // Validar formato de e-mail
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  // Validar WhatsApp (mínimo 10 dígitos)
  if (whatsapp.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'WhatsApp inválido.' });
  }

  // Salvar lead em log local (fallback sempre funciona)
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const logLine = `[${timestamp}] LEAD | Nome: ${nome} | E-mail: ${email} | WhatsApp: ${whatsapp} | Área: ${area}\n`;
  const fs = require('fs');
  try { fs.appendFileSync(path.join(__dirname, 'leads.log'), logLine); } catch(e) {}

  // Tentar enviar e-mail (não bloqueia a resposta se falhar)
  if (process.env.MAIL_PASS) {
    try {
      const transporter = createMailTransport();
      await transporter.sendMail({
        from: `"Primora Diagnóstica" <${process.env.MAIL_USER || 'dermabrandinfo@gmail.com'}>`,
        to: 'dermabrandinfo@gmail.com',
        subject: `🩺 Novo Lead Primora — ${nome} (${area})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d0d0d;color:#f5f0e8;padding:32px;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
              <h1 style="color:#c9a84c;font-size:22px;margin:0">✨ Novo Lead — Primora Diagnóstica</h1>
              <p style="color:#888;font-size:13px;margin:8px 0 0">Recebido em ${timestamp}</p>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:12px 0;border-bottom:1px solid #222;color:#888;width:140px">Nome</td><td style="padding:12px 0;border-bottom:1px solid #222;font-weight:bold">${nome}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #222;color:#888">E-mail</td><td style="padding:12px 0;border-bottom:1px solid #222"><a href="mailto:${email}" style="color:#c9a84c">${email}</a></td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #222;color:#888">WhatsApp</td><td style="padding:12px 0;border-bottom:1px solid #222"><a href="https://wa.me/55${whatsapp.replace(/\D/g,'')}" style="color:#c9a84c">${whatsapp}</a></td></tr>
              <tr><td style="padding:12px 0;color:#888">Área de Atuação</td><td style="padding:12px 0;color:#c9a84c;font-weight:bold">${area}</td></tr>
            </table>
            <div style="margin-top:24px;padding:16px;background:#1a1a1a;border-radius:8px;text-align:center">
              <a href="https://wa.me/55${whatsapp.replace(/\D/g,'')}" style="display:inline-block;background:#c9a84c;color:#0d0d0d;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">💬 Responder no WhatsApp</a>
            </div>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error('[Lead] Falha no envio de e-mail:', mailErr.message);
    }
  } else {
    console.log('[Lead] MAIL_PASS não configurado — lead salvo apenas em log local.');
  }

  return res.json({ ok: true });
});

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dermabrand rodando em http://localhost:${PORT}`));
}

module.exports = app;
