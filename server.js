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

  const prompt = `Você é um especialista em branding médico premium e estratégia de posicionamento digital para dermatologistas e clínicas de alto padrão no Brasil.

Sua análise deve ser técnica, especializada e orientada a resultados reais de atração de pacientes particulares.

Analise os dados abaixo com rigor profissional e gere um diagnóstico estratégico completo.

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

ESTRUTURA DA RESPOSTA (exatamente 6 seções):

1. POSICIONAMENTO E AUTORIDADE
Avalie se o perfil transmite autoridade médica, clareza de especialidade e posicionamento premium.
Diga o nível: (Baixo / Médio / Alto)
Explique de forma direta e concisa.

Inclua obrigatoriamente, dentro desta seção, as três notas abaixo, sempre no formato exato:
Score de Autoridade: X/10
Score de Bio e Posicionamento: X/10
Score de Conteúdo e Engajamento: X/10

Logo após as três notas, explique em 2 a 4 frases a base dos scores. Deixe claro que são estimativas estratégicas de branding digital, baseadas nos dados do perfil e nos sinais informados, não métricas oficiais do Instagram. Justifique objetivamente os principais fatores que elevaram ou reduziram cada nota.

Critérios das notas:
- Score de Autoridade: percepção de expertise, confiança, diferenciação médica, prova de especialidade, consistência de imagem e presença premium.
- Score de Bio e Posicionamento: clareza da especialidade, promessa de valor, diferenciais reais, credibilidade, localização, coerência de linguagem e CTA sóbrio.
- Score de Conteúdo e Engajamento: consistência editorial, qualidade percebida, adequação à comunicação em saúde, conexão com paciente, frequência, sinais de engajamento e potencial de conversão.

---

2. ANÁLISE DA BIO (Especializada)
Avalie como especialista em branding médico:
- **Posicionamento**: O perfil deixa claro o diferencial?
- **Linguagem**: Usa termos que atraem pacientes particulares ou é genérica?
- **Credibilidade**: Transmite expertise e confiança?
- **CTA**: Tem chamada clara para ação?
- **Oportunidades**: O que está faltando para converter melhor?

Sugira uma BIO otimizada (máx 150 caracteres) com tom médico, sóbrio, técnico e premium. A bio deve transmitir especialidade, método, autoridade clínica e clareza de atendimento sem parecer propaganda. Não use emojis, símbolos decorativos, promessas de resultado, frases como “transformando pele”, “resultados que falam”, “dermatologia de excelência”, “agende sua avaliação” ou qualquer chamada comercial genérica.

---

3. ANÁLISE DE CONTEÚDO
Avalie:
- Qualidade percebida
- Clareza da comunicação
- Foco em paciente vs técnico
- Variedade de conteúdo

Identifique:
- O que está faltando
- O que está excessivo
- O que deve ser priorizado

---

4. ENGAJAMENTO E PERFORMANCE
Com base nos dados:
- O engajamento está bom, médio ou baixo?
- O conteúdo gera conexão ou apenas informação?
- Existe potencial de crescimento?
- Taxa de engajamento estimada

---

5. ERROS E GARGALOS
Liste os principais erros estratégicos que estão impedindo o crescimento ou a conversão. Seja específico e acionável.

---

6. PLANO DE MELHORIA (EXECUTIVO)
Apresente um plano conciso e acionável:
- **Ações Imediatas** (próximas 2 semanas): 2-3 mudanças de impacto rápido
- **Conteúdo Estratégico**: Tipos específicos a priorizar
- **Frequência Recomendada**: Postagens por semana
- **Diferencial Competitivo**: Como se destacar
- **Métrica de Sucesso**: Como medir melhoria

Seja direto e evite recomendações genéricas.

---

REGRAS:
- Linguagem sofisticada, técnica, sóbria e compatível com a credibilidade médica.
- Nunca use emojis, ícones decorativos, símbolos chamativos ou linguagem de influenciador.
- Evitar clichês, generalizações, promessas de resultado, frases promocionais e ofertas de serviços.
- Foco em diagnóstico estratégico, não em vendas.
- Pensar como especialista em branding médico premium, respeitando a seriedade da comunicação em saúde.
- Seja conciso e acionável.
- Use dados para sustentar cada recomendação.
- Não mencione consultas gratuitas, avaliações, agendamentos, descontos, ofertas ou chamadas comerciais agressivas.
- A análise de BIO deve ser profunda, especializada e crítica; explique exatamente por que a bio atual transmite ou não autoridade.
- A sugestão de bio deve parecer adequada para uma médica/dermatologista de alto padrão: sem emoji, sem sensacionalismo, sem promessas e sem termos genéricos como “transformando vidas”, “resultados que falam”, “excelência” ou “inovação e cuidado” quando não houver evidência.
- As três notas devem ser realistas, rigorosas e justificáveis; evite notas infladas sem evidência e explique os critérios usados de forma compreensível para o usuário final.
- Nunca use visualização circular, gráfico ou termos técnicos de interface no texto; apenas entregue os scores no formato solicitado`;

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

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Dermabrand rodando em http://localhost:${PORT}`));
}

module.exports = app;
