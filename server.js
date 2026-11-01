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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname));

// Sincroniza tabelas e garante colunas novas
async function iniciarBanco() {
    if (!connectionString) {
        console.log("DATABASE_URL não configurada. Verifique as variáveis de ambiente no Render.");
        return;
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id BIGSERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                foto TEXT,
                bio TEXT,
                salvos JSONB DEFAULT '[]'::jsonb
            );

            CREATE TABLE IF NOT EXISTS posts (
                id BIGSERIAL PRIMARY KEY,
                autor_id BIGINT REFERENCES usuarios(id),
                autor_nome TEXT NOT NULL,
                conteudo TEXT NOT NULL,
                curtidas JSONB DEFAULT '[]'::jsonb,
                comentarios JSONB DEFAULT '[]'::jsonb,
                criado_em TEXT NOT NULL
            );

            -- Garante que colunas adicionadas em atualizações existam
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS salvos JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE posts ADD COLUMN IF NOT EXISTS comentarios JSONB DEFAULT '[]'::jsonb;
        `);
        console.log("Banco de dados sincronizado e pronto!");
    } catch (err) {
        console.error("Erro na inicialização do banco:", err);
    }
}
iniciarBanco();

// 1. Cadastro
app.post('/api/cadastrar', async (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos!" });
    }

    try {
        const senhaHash = bcrypt.hashSync(senha, 10);
        const fotoPadrao = "https://via.placeholder.com/150/1877f2/ffffff?text=Perfil";
        const bioPadrao = "Olá! Estou na rede social.";

        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, foto, bio, salvos) 
             VALUES ($1, $2, $3, $4, $5, '[]'::jsonb) 
             RETURNING id, nome, email, foto, bio, salvos`,
            [nome, email, senhaHash, fotoPadrao, bioPadrao]
        );

        res.status(201).json({ mensagem: "Conta criada com sucesso!", usuario: resultado.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
        }
        console.error(err);
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
        console.error(err);
        res.status(500).json({ erro: "Erro no login." });
    }
});

// 3. Atualizar Foto e Bio
app.put('/api/usuarios/:id', async (req, res) => {
    const id = req.params.id;
    const { foto, bio } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE usuarios SET foto = COALESCE($1, foto), bio = COALESCE($2, bio) 
             WHERE id = $3 RETURNING id, nome, email, foto, bio, salvos`,
            [foto, bio, id]
        );
        res.json({ mensagem: "Perfil atualizado!", usuario: resultado.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao atualizar perfil." });
    }
});

// 4. Salvar / Desalvar Post
app.post('/api/posts/:id/salvar', async (req, res) => {
    const postId = parseInt(req.params.id);
    const { usuarioId } = req.body;

    try {
        const userRes = await pool.query(`SELECT salvos FROM usuarios WHERE id = $1`, [usuarioId]);
        if (userRes.rows.length === 0) return res.status(404).json({ erro: "Usuário não encontrado." });

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
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao salvar post." });
    }
});

// 5. Listar Posts
app.get('/api/posts', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.autor_id AS "autorId", p.autor_nome AS "autorNome", 
                   p.conteudo, p.curtidas, p.comentarios, p.criado_em AS "criadoEm",
                   COALESCE(u.foto, 'https://via.placeholder.com/150') AS "autorFoto"
            FROM posts p
            LEFT JOIN usuarios u ON p.autor_id = u.id
            ORDER BY p.id DESC
        `;
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao buscar posts." });
    }
});

// 6. Criar Post
app.post('/api/posts', async (req, res) => {
    const { autorId, autorNome, conteudo } = req.body;
    if (!conteudo || !autorId) {
        return res.status(400).json({ erro: "Conteúdo e autor são obrigatórios." });
    }

    const criadoEm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
        const resultado = await pool.query(
            `INSERT INTO posts (autor_id, autor_nome, conteudo, curtidas, comentarios, criado_em) 
             VALUES ($1, $2, $3, '[]'::jsonb, '[]'::jsonb, $4) 
             RETURNING id, autor_id AS "autorId", autor_nome AS "autorNome", conteudo, curtidas, comentarios, criado_em AS "criadoEm"`,
            [autorId, autorNome, conteudo, criadoEm]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao salvar publicação no banco." });
    }
});

// 7. Curtir Post
app.post('/api/posts/:id/curtir', async (req, res) => {
    const postId = req.params.id;
    const { usuarioId } = req.body;

    try {
        const postResult = await pool.query(`SELECT curtidas FROM posts WHERE id = $1`, [postId]);
        if (postResult.rows.length === 0) return res.status(404).json({ erro: "Post não encontrado." });

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
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao processar curtida." });
    }
});

// 8. Comentar Post
app.post('/api/posts/:id/comentar', async (req, res) => {
    const postId = req.params.id;
    const { autorNome, texto } = req.body;
    if (!texto) return res.status(400).json({ erro: "Comentário não pode ser vazio." });

    try {
        const postResult = await pool.query(`SELECT comentarios FROM posts WHERE id = $1`, [postId]);
        if (postResult.rows.length === 0) return res.status(404).json({ erro: "Post não encontrado." });

        let comentarios = postResult.rows[0].comentarios || [];
        const novoComentario = {
            id: Date.now(),
            autorNome,
            texto
        };

        comentarios.push(novoComentario);
        await pool.query(`UPDATE posts SET comentarios = $1 WHERE id = $2`, [JSON.stringify(comentarios), postId]);

        res.status(201).json(novoComentario);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao salvar comentário." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR NO AR NA PORTA ${PORT}!`);
});