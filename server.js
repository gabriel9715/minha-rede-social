const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
app.use(express.static(__dirname));

async function iniciarBanco() {
    if (!connectionString) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id BIGSERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                foto TEXT,
                bio TEXT,
                salvos JSONB DEFAULT '[]'::jsonb,
                seguindo JSONB DEFAULT '[]'::jsonb,
                seguidores JSONB DEFAULT '[]'::jsonb,
                bloqueados JSONB DEFAULT '[]'::jsonb
            );

            CREATE TABLE IF NOT EXISTS posts (
                id BIGSERIAL PRIMARY KEY,
                autor_id BIGINT REFERENCES usuarios(id),
                autor_nome TEXT NOT NULL,
                conteudo TEXT NOT NULL,
                midia_url TEXT,
                midia_tipo TEXT,
                curtidas JSONB DEFAULT '[]'::jsonb,
                comentarios JSONB DEFAULT '[]'::jsonb,
                criado_em TEXT NOT NULL
            );

            -- Nova Tabela de Stories (com timestamp para expirar em 24h)
            CREATE TABLE IF NOT EXISTS stories (
                id BIGSERIAL PRIMARY KEY,
                autor_id BIGINT REFERENCES usuarios(id),
                autor_nome TEXT NOT NULL,
                midia_url TEXT NOT NULL,
                midia_tipo TEXT NOT NULL,
                criado_em BIGINT NOT NULL
            );

            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS salvos JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS seguindo JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS seguidores JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueados JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE posts ADD COLUMN IF NOT EXISTS comentarios JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE posts ADD COLUMN IF NOT EXISTS midia_url TEXT;
            ALTER TABLE posts ADD COLUMN IF NOT EXISTS midia_tipo TEXT;
        `);
        console.log("Banco sincronizado com Suporte a Stories de 24h!");
    } catch (err) {
        console.error("Erro na inicialização do banco:", err);
    }
}
iniciarBanco();

// 1. Cadastrar
app.post('/api/cadastrar', async (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos!" });

    try {
        const senhaHash = bcrypt.hashSync(senha, 10);
        const fotoPadrao = "https://via.placeholder.com/150/1877f2/ffffff?text=Perfil";
        const bioPadrao = "Olá! Estou na rede social.";

        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, foto, bio, salvos, seguindo, seguidores, bloqueados) 
             VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb) 
             RETURNING id, nome, email, foto, bio, salvos, seguindo, seguidores, bloqueados`,
            [nome, email, senhaHash, fotoPadrao, bioPadrao]
        );

        res.status(201).json({ mensagem: "Conta criada com sucesso!", usuario: resultado.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
        res.status(500).json({ erro: "Erro ao cadastrar usuário." });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const resultado = await pool.query(`SELECT * FROM usuarios WHERE email = $1`, [email]);
        const usuario = resultado.rows[0];

        if (!usuario || !bcrypt.compareSync(senha, usuario.senha)) {
            return res.status(400).json({ erro: "E-mail ou senha incorretos." });
        }

        const { senha: _, ...usuarioSemSenha } = usuario;
        res.json({ mensagem: "Login realizado com sucesso!", usuario: usuarioSemSenha });
    } catch (err) {
        res.status(500).json({ erro: "Erro no login." });
    }
});

// 3. Obter Perfil
app.get('/api/usuarios/:id/perfil', async (req, res) => {
    const id = req.params.id;
    try {
        const resultado = await pool.query(
            `SELECT id, nome, email, foto, bio, salvos, seguindo, seguidores, bloqueados FROM usuarios WHERE id = $1`,
            [id]
        );
        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Usuário não encontrado." });
        res.json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar perfil." });
    }
});

// 4. Atualizar Perfil
app.put('/api/usuarios/:id', async (req, res) => {
    const id = req.params.id;
    const { foto, bio } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE usuarios SET foto = COALESCE($1, foto), bio = COALESCE($2, bio) 
             WHERE id = $3 RETURNING id, nome, email, foto, bio, salvos, seguindo, seguidores, bloqueados`,
            [foto, bio, id]
        );
        res.json({ mensagem: "Perfil atualizado!", usuario: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar perfil." });
    }
});

// 5. Seguir / Deixar de Seguir
app.post('/api/usuarios/:id/seguir', async (req, res) => {
    const alvoId = parseInt(req.params.id);
    const { meuId } = req.body;

    if (alvoId === meuId) return res.status(400).json({ erro: "Você não pode seguir a si mesmo." });

    try {
        const meuRes = await pool.query(`SELECT seguindo FROM usuarios WHERE id = $1`, [meuId]);
        const alvoRes = await pool.query(`SELECT seguidores FROM usuarios WHERE id = $1`, [alvoId]);

        if (meuRes.rows.length === 0 || alvoRes.rows.length === 0) {
            return res.status(404).json({ erro: "Usuário não encontrado." });
        }

        let meuSeguindo = meuRes.rows[0].seguindo || [];
        let alvoSeguidores = alvoRes.rows[0].seguidores || [];

        const index = meuSeguindo.indexOf(alvoId);
        let seguindoAgora = false;

        if (index === -1) {
            meuSeguindo.push(alvoId);
            if (!alvoSeguidores.includes(meuId)) alvoSeguidores.push(meuId);
            seguindoAgora = true;
        } else {
            meuSeguindo.splice(index, 1);
            const alvoIndex = alvoSeguidores.indexOf(meuId);
            if (alvoIndex !== -1) alvoSeguidores.splice(alvoIndex, 1);
        }

        await pool.query(`UPDATE usuarios SET seguindo = $1 WHERE id = $2`, [JSON.stringify(meuSeguindo), meuId]);
        await pool.query(`UPDATE usuarios SET seguidores = $1 WHERE id = $2`, [JSON.stringify(alvoSeguidores), alvoId]);

        res.json({ seguindoAgora, seguindo: meuSeguindo });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar seguidores." });
    }
});

// 6. Bloquear Usuário
app.post('/api/usuarios/:id/bloquear', async (req, res) => {
    const alvoId = parseInt(req.params.id);
    const { meuId } = req.body;

    if (alvoId === meuId) return res.status(400).json({ erro: "Você não pode se bloquear." });

    try {
        const meuRes = await pool.query(`SELECT bloqueados, seguindo FROM usuarios WHERE id = $1`, [meuId]);
        let bloqueados = meuRes.rows[0].bloqueados || [];
        let seguindo = meuRes.rows[0].seguindo || [];

        const index = bloqueados.indexOf(alvoId);
        let bloqueou = false;

        if (index === -1) {
            bloqueados.push(alvoId);
            const segIndex = seguindo.indexOf(alvoId);
            if (segIndex !== -1) seguindo.splice(segIndex, 1);
            bloqueou = true;
        } else {
            bloqueados.splice(index, 1);
        }

        await pool.query(`UPDATE usuarios SET bloqueados = $1, seguindo = $2 WHERE id = $3`, [JSON.stringify(bloqueados), JSON.stringify(seguindo), meuId]);
        res.json({ bloqueou, bloqueados });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao bloquear." });
    }
});

// 7. Salvar / Desalvar Post
app.post('/api/posts/:id/salvar', async (req, res) => {
    const postId = parseInt(req.params.id);
    const { usuarioId } = req.body;

    try {
        const userRes = await pool.query(`SELECT salvos FROM usuarios WHERE id = $1`, [usuarioId]);
        let salvos = userRes.rows[0].salvos || [];
        const index = salvos.indexOf(postId);
        let salvou = false;

        if (index === -1) {
            salvos.push(postId);
            salvou = true;
        } else {
            salvos.splice(index, 1);
        }

        await pool.query(`UPDATE usuarios SET salvos = $1 WHERE id = $2`, [JSON.stringify(salvos), usuarioId]);
        res.json({ salvou, salvos });
    } catch {
        res.status(500).json({ erro: "Erro ao salvar post." });
    }
});

// 8. Listar Posts
app.get('/api/posts', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.autor_id AS "autorId", p.autor_nome AS "autorNome", 
                   p.conteudo, p.midia_url AS "midiaUrl", p.midia_tipo AS "midiaTipo",
                   p.curtidas, p.comentarios, p.criado_em AS "criadoEm",
                   COALESCE(u.foto, 'https://via.placeholder.com/150') AS "autorFoto"
            FROM posts p
            LEFT JOIN usuarios u ON p.autor_id = u.id
            ORDER BY p.id DESC
        `;
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar posts." });
    }
});

// 9. Criar Post
app.post('/api/posts', async (req, res) => {
    const { autorId, autorNome, conteudo, midiaUrl, midiaTipo } = req.body;
    
    if ((!conteudo || !conteudo.trim()) && !midiaUrl) {
        return res.status(400).json({ erro: "Escreva algo ou anexe uma foto/vídeo para postar!" });
    }
    if (!autorId) return res.status(400).json({ erro: "Autor não identificado." });

    const criadoEm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
        const resultado = await pool.query(
            `INSERT INTO posts (autor_id, autor_nome, conteudo, midia_url, midia_tipo, curtidas, comentarios, criado_em) 
             VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, '[]'::jsonb, $6) 
             RETURNING id, autor_id AS "autorId", autor_nome AS "autorNome", conteudo, 
                       midia_url AS "midiaUrl", midia_tipo AS "midiaTipo", curtidas, comentarios, criado_em AS "criadoEm"`,
            [autorId, autorNome, conteudo || "", midiaUrl || null, midiaTipo || null, criadoEm]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao salvar publicação." });
    }
});

// 10. Curtir Post
app.post('/api/posts/:id/curtir', async (req, res) => {
    const postId = req.params.id;
    const { usuarioId } = req.body;

    try {
        const postResult = await pool.query(`SELECT curtidas FROM posts WHERE id = $1`, [postId]);
        let curtidas = postResult.rows[0].curtidas || [];
        const index = curtidas.indexOf(usuarioId);
        let curtiu = false;

        if (index === -1) {
            curtidas.push(usuarioId);
            curtiu = true;
        } else {
            curtidas.splice(index, 1);
        }

        await pool.query(`UPDATE posts SET curtidas = $1 WHERE id = $2`, [JSON.stringify(curtidas), postId]);
        res.json({ totalCurtidas: curtidas.length, curtiu });
    } catch {
        res.status(500).json({ erro: "Erro ao curtir post." });
    }
});

// 11. Comentar Post
app.post('/api/posts/:id/comentar', async (req, res) => {
    const postId = req.params.id;
    const { autorNome, texto } = req.body;
    if (!texto) return res.status(400).json({ erro: "Comentário não pode ser vazio." });

    try {
        const postResult = await pool.query(`SELECT comentarios FROM posts WHERE id = $1`, [postId]);
        let comentarios = postResult.rows[0].comentarios || [];

        const novoComentario = { id: Date.now(), autorNome, texto };
        comentarios.push(novoComentario);
        await pool.query(`UPDATE posts SET comentarios = $1 WHERE id = $2`, [JSON.stringify(comentarios), postId]);

        res.status(201).json(novoComentario);
    } catch {
        res.status(500).json({ erro: "Erro ao comentar." });
    }
});

// ================= ROTAS DE STORIES (24 HORAS) =================

// 12. Publicar Story
app.post('/api/stories', async (req, res) => {
    const { autorId, autorNome, midiaUrl, midiaTipo } = req.body;
    if (!midiaUrl || !autorId) return res.status(400).json({ erro: "Mídia obrigatória para o Story." });

    const agora = Date.now();

    try {
        const resultado = await pool.query(
            `INSERT INTO stories (autor_id, autor_nome, midia_url, midia_tipo, criado_em) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [autorId, autorNome, midiaUrl, midiaTipo, agora]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao publicar Story." });
    }
});

// 13. Listar Stories (Apenas das últimas 24 horas = 86400000 ms)
app.get('/api/stories', async (req, res) => {
    const limite24h = Date.now() - (24 * 60 * 60 * 1000);

    try {
        const query = `
            SELECT s.id, s.autor_id AS "autorId", s.autor_nome AS "autorNome", 
                   s.midia_url AS "midiaUrl", s.midia_tipo AS "midiaTipo", s.criado_em AS "criadoEm",
                   COALESCE(u.foto, 'https://via.placeholder.com/150') AS "autorFoto"
            FROM stories s
            LEFT JOIN usuarios u ON s.autor_id = u.id
            WHERE s.criado_em >= $1
            ORDER BY s.id DESC
        `;
        const resultado = await pool.query(query, [limite24h]);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao carregar stories." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR NO AR NA PORTA ${PORT}!`);
});