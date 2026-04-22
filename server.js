require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-20251.p.rapidapi.com';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── GET /api/profile?username=xxx ─────────────────────────────────────────────
app.get('/api/profile', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username obrigatório' });

  try {
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/userinfo/?username_or_id=${username}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `RapidAPI erro ${response.status}`, detail: text });
    }

    const data = await response.json();
    const user = data?.data?.user || data?.user || data?.data || data;

    if (!user || (!user.username && !user.full_name)) {
      return res.status(404).json({ error: 'Perfil não encontrado ou privado.' });
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
    full_name, username, biography, follower_count,
    following_count, media_count, is_verified, category,
  } = profile;

  function fmtNum(n) {
    if (!n && n !== 0) return '—';
    n = parseInt(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  const contentStr = contentTypes && contentTypes.length > 0
    ? `\n- Tipos de conteúdo frequentemente postados: ${contentTypes.join(', ')}`
    : '';

  const prompt = `Você é um especialista em marketing médico premium da agência Dermabrand, com foco em dermatologistas e clínicas de alto padrão no Brasil. Analise este perfil do Instagram e gere um relatório estratégico orientado à conversão de pacientes particulares.

DADOS DO PERFIL:
- Nome: ${full_name || username || 'Não informado'}
- @username: @${username || 'Não informado'}
- Bio: ${biography || 'Não informada'}
- Seguidores: ${fmtNum(follower_count)}
- Seguindo: ${fmtNum(following_count)}
- Total de posts: ${fmtNum(media_count)}
- Categoria: ${category || 'Não informada'}
- Verificado: ${is_verified ? 'Sim' : 'Não'}${contentStr}

Responda EXATAMENTE neste formato com os marcadores entre colchetes:

[POSICIONAMENTO]
Nível: Alto / Médio / Baixo
Análise em 2-3 frases diretas sobre autoridade e posicionamento premium.

[BIO]
Diagnóstico em 2 frases.
BIO OTIMIZADA: (bio pronta para uso, máx 150 caracteres)

[CONTEÚDO]
Diagnóstico da qualidade baseado nos tipos de conteúdo postados (se informados).
O que falta: (lista rápida)
O que priorizar: (lista rápida)

[ENGAJAMENTO]
Nível: Bom / Médio / Baixo
Análise de 2-3 frases sobre conexão e potencial de crescimento.

[ERROS]
3 a 5 erros estratégicos objetivos.

[PLANO]
Frequência ideal, tipos de conteúdo adicionais, ajustes de linguagem — direto e prático.

[IDEAS]
5 ideias de posts premium (alinhadas aos tipos de conteúdo):
Gancho: | Tema: | Objetivo: atrair/educar/converter

Linguagem sofisticada, sem clichês, foco em resultado real.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';

    if (!text) return res.status(500).json({ error: 'IA não retornou análise', detail: data });

    return res.json({ ok: true, report: text });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar análise', detail: err.message });
  }
});

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dermabrand rodando em http://localhost:${PORT}`));
