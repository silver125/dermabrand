require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '0e22bdfa13msh0e3e0fcbe1c11fdp128553jsn968d0eb71654';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-20251.p.rapidapi.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── GET /api/profile?username=xxx ─────────────────────────────────────────────
app.get('/api/profile', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username obrigatório' });

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
  const { profile, contentTypes } = req.body;
  if (!profile) return res.status(400).json({ error: 'Dados do perfil obrigatórios' });

  const {
    full_name, username, specialty, city, biography,
    follower_count, likes, comments, frequency,
    captions, observations
  } = profile;

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
  { month: 1, day: 1,  label: 'Ano Novo', tags: ['bem-estar','saúde mental','metas de saúde'] },
  { month: 1, day: 17, label: 'Dia Mundial da Religião (Bem-estar)', tags: ['saúde mental','equilíbrio'] },
  { month: 1, day: 27, label: 'Dia Nacional de Combate à Hansenaníase', tags: ['dermatologia','infectologia','saúde pública'] },
  // Fevereiro
  { month: 2, day: 4,  label: 'Dia Mundial do Câncer', tags: ['oncologia','prevenção','dermatologia'] },
  { month: 2, day: 14, label: 'Dia dos Namorados (EUA/Internacional)', tags: ['bem-estar','saúde sexual','relacionamentos'] },
  { month: 2, day: 28, label: 'Dia das Doenças Raras', tags: ['genética','neurologia','saúde pública'] },
  // Março
  { month: 3, day: 1,  label: 'Início do Verão no Hemisfério Sul (calor intenso)', tags: ['dermatologia','fotoproteção','hidratação'] },
  { month: 3, day: 8,  label: 'Dia Internacional da Mulher', tags: ['saúde feminina','ginecologia','bem-estar'] },
  { month: 3, day: 20, label: 'Dia Mundial da Felicidade', tags: ['saúde mental','psiquiatria','bem-estar'] },
  { month: 3, day: 21, label: 'Dia Mundial da Doença de Down', tags: ['genética','neurologia','pediatria'] },
  { month: 3, day: 24, label: 'Dia Mundial da Tuberculose', tags: ['infectologia','pneumologia','saúde pública'] },
  { month: 3, day: 26, label: 'Dia Nacional de Prevenção e Combate à Hipertensão', tags: ['cardiologia','clínica médica','saúde pública'] },
  // Abril
  { month: 4, day: 2,  label: 'Dia Mundial do Autismo (Abril Azul)', tags: ['neurologia','pediatria','psiquiatria'] },
  { month: 4, day: 7,  label: 'Dia Mundial da Saúde', tags: ['saúde pública','prevenção','bem-estar'] },
  { month: 4, day: 17, label: 'Dia Nacional de Combate à Hipertensão', tags: ['cardiologia','clínica médica'] },
  { month: 4, day: 22, label: 'Dia da Terra (Sustentabilidade e Saúde)', tags: ['saúde ambiental','bem-estar'] },
  // Maio
  { month: 5, day: 1,  label: 'Dia do Trabalho (Maio Amarelo — saúde mental no trabalho)', tags: ['saúde mental','psiquiatria','bem-estar'] },
  { month: 5, day: 11, label: 'Dia Nacional de Prevenção da Obesidade', tags: ['endocrinologia','nutrologia','cirurgia bariátrica'] },
  { month: 5, day: 12, label: 'Dia das Mães', tags: ['saúde feminina','ginecologia','bem-estar','dermatologia'] },
  { month: 5, day: 15, label: 'Dia da Familia (Saúde Familiar)', tags: ['pediatria','clínica médica','saúde pública'] },
  { month: 5, day: 17, label: 'Dia Mundial da Hipertensão', tags: ['cardiologia','clínica médica','saúde pública'] },
  { month: 5, day: 22, label: 'Dia Mundial da Diversidade Biológica', tags: ['saúde ambiental'] },
  { month: 5, day: 25, label: 'Dia Nacional de Prevenção da Hipertensão', tags: ['cardiologia'] },
  { month: 5, day: 28, label: 'Dia Internacional da Saúde da Mulher', tags: ['ginecologia','saúde feminina'] },
  { month: 5, day: 31, label: 'Dia Mundial Sem Tabaco', tags: ['pneumologia','cardiologia','oncologia'] },
  // Junho
  { month: 6, day: 5,  label: 'Dia Mundial do Meio Ambiente', tags: ['saúde ambiental','bem-estar'] },
  { month: 6, day: 12, label: 'Dia dos Namorados (Brasil)', tags: ['saúde sexual','dermatologia','bem-estar','ginecologia'] },
  { month: 6, day: 13, label: 'Festa Junina (Inverno Brasileiro)', tags: ['nutrição','endocrinologia','dermatologia'] },
  { month: 6, day: 21, label: 'Início do Inverno', tags: ['dermatologia','pneumologia','imunologia','nutrição'] },
  { month: 6, day: 26, label: 'Dia Internacional de Combate às Drogas', tags: ['psiquiatria','saúde mental','saúde pública'] },
  // Julho
  { month: 7, day: 11, label: 'Dia Mundial da População', tags: ['saúde pública','ginecologia'] },
  { month: 7, day: 28, label: 'Dia Mundial da Hepatite', tags: ['gastroenterologia','infectologia','hepatologia'] },
  // Agosto
  { month: 8, day: 1,  label: 'Agosto Dourado — Semana Mundial do Aleitamento Materno', tags: ['pediatria','ginecologia','nutrologia'] },
  { month: 8, day: 9,  label: 'Dia Nacional de Combate ao Fumo', tags: ['pneumologia','cardiologia','oncologia'] },
  { month: 8, day: 13, label: 'Dia dos Pais', tags: ['saúde masculina','urologia','cardiologia','bem-estar'] },
  { month: 8, day: 26, label: 'Dia Nacional de Doação de Órgãos', tags: ['cirurgia','saúde pública','nefrologia'] },
  // Setembro
  { month: 9, day: 10, label: 'Dia Mundial de Prevenção ao Suicídio (Setembro Amarelo)', tags: ['psiquiatria','saúde mental','neurologia'] },
  { month: 9, day: 21, label: 'Dia Mundial do Alzheimer', tags: ['neurologia','geriatria','psiquiatria'] },
  { month: 9, day: 22, label: 'Início da Primavera', tags: ['dermatologia','alergologia','nutrição'] },
  { month: 9, day: 29, label: 'Dia Mundial do Coração', tags: ['cardiologia','clínica médica','saúde pública'] },
  // Outubro
  { month: 10, day: 1,  label: 'Dia Internacional do Idoso', tags: ['geriatria','cardiologia','ortopedia'] },
  { month: 10, day: 2,  label: 'Outubro Rosa — Câncer de Mama', tags: ['mastologia','ginecologia','oncologia','dermatologia'] },
  { month: 10, day: 10, label: 'Dia Mundial da Saúde Mental', tags: ['psiquiatria','saúde mental','neurologia'] },
  { month: 10, day: 12, label: 'Dia das Crianças', tags: ['pediatria','nutrição','dermatologia'] },
  { month: 10, day: 15, label: 'Dia do Médico', tags: ['todos os especialistas','branding médico'] },
  { month: 10, day: 16, label: 'Dia Mundial da Alimentação', tags: ['nutrologia','endocrinologia','gastroenterologia'] },
  { month: 10, day: 20, label: 'Dia Mundial da Osteoporose', tags: ['ortopedia','reumatologia','endocrinologia'] },
  { month: 10, day: 31, label: 'Halloween (Tendências de beleza e pele)', tags: ['dermatologia','cirurgia plástica'] },
  // Novembro
  { month: 11, day: 1,  label: 'Novembro Azul — Saúde Masculina', tags: ['urologia','andrologia','cardiologia','saúde masculina'] },
  { month: 11, day: 14, label: 'Dia Mundial do Diabetes', tags: ['endocrinologia','nutrologia','clínica médica'] },
  { month: 11, day: 20, label: 'Dia da Consciência Negra (Saúde da População Negra)', tags: ['dermatologia','saúde pública','hematologia'] },
  { month: 11, day: 25, label: 'Dia Internacional de Eliminação da Violência contra a Mulher', tags: ['saúde feminina','psiquiatria','saúde pública'] },
  // Dezembro
  { month: 12, day: 1,  label: 'Dia Mundial de Combate à AIDS (Dezembro Vermelho)', tags: ['infectologia','ginecologia','saúde sexual','dermatologia'] },
  { month: 12, day: 9,  label: 'Dia Internacional do Combate à Corrupção (Transparência em Saúde)', tags: ['saúde pública'] },
  { month: 12, day: 21, label: 'Início do Verão', tags: ['dermatologia','fotoproteção','nutrição','cirurgia plástica'] },
  { month: 12, day: 25, label: 'Natal (Bem-estar e Alimentação nas Festas)', tags: ['nutrologia','endocrinologia','saúde mental','bem-estar'] },
  { month: 12, day: 31, label: 'Réveillon (Metas de Saúde para o Novo Ano)', tags: ['bem-estar','saúde mental','nutrologia','dermatologia'] },
];

// Eventos especiais recorrentes (Copa do Mundo, Olimpíadas, etc.) — adicionar quando confirmados
const SPECIAL_EVENTS = [
  // Copa do Mundo FIFA 2026: Jun-Jul 2026
  { from: '2026-06-11', to: '2026-07-19', label: 'Copa do Mundo FIFA 2026', tags: ['medicina esportiva','ortopedia','nutrição','cardiologia','fisioterapia'] },
  // Olimpíadas Paris 2024 (passadas, mas manter para referência de padrão)
  // { from: '2024-07-26', to: '2024-08-11', label: 'Olimpíadas Paris 2024', tags: ['medicina esportiva','ortopedia'] },
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
  const { specialty, category, username } = req.body;
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

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dermabrand rodando em http://localhost:${PORT}`));
}

module.exports = app;
