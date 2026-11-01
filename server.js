const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexão com o Banco PostgreSQL na Nuvem
// Se não houver link configurado na nuvem, usa o SQLite local de fallback
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname));

// Criação automática das tabelas permanentes
async function iniciarBanco() {
    if (!connectionString) {
        console.log("Aviso: DATABASE_URL não encontrada. Usando modo de teste.");
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
                bio TEXT
            );

            CREATE TABLE IF NOT EXISTS posts (
                id BIGSERIAL PRIMARY KEY,
                autor_id BIGINT REFERENCES usuarios(id),
                autor_nome TEXT NOT NULL,
                conteudo TEXT NOT NULL,
                curtidas JSONB DEFAULT '[]'::jsonb,
                criado_em TEXT NOT NULL
            );
        `);
        console.log("Banco de dados PostgreSQL conectado e tabelas criadas!");
    } catch (err) {
        console.error("Erro ao iniciar banco:", err);
    }
}
iniciarBanco();

// 1. Cadastrar Usuário
app.post('/api/cadastrar', async (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos!" });

    try {
        const senhaHash = bcrypt.hashSync(senha, 10);
        const fotoPadrao = "https://via.placeholder.com/150/1877f2/ffffff?text=Perfil";
        const bioPadrao = "Olá! Estou na rede social.";

        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, foto, bio) VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, foto, bio`,
            [nome, email, senhaHash, fotoPadrao, bioPadrao]
        );

        res.status(201).json({ mensagem: "Conta criada com sucesso!", usuario: resultado.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
        }
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
        res.json({ mensagem: "Login realizado!", usuario: usuarioSemSenha });
    } catch (err) {
        res.status(500).json({ erro: "Erro no login." });
    }
});

// 3. Atualizar Foto e Bio
app.put('/api/usuarios/:id', async (req, res) => {
    const id = req.params.id;
    const { foto, bio } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE usuarios SET foto = COALESCE($1, foto), bio = COALESCE($2, bio) WHERE id = $3 RETURNING id, nome, email, foto, bio`,
            [foto, bio, id]
        );

        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Usuário não encontrado." });

        res.json({ mensagem: "Perfil atualizado!", usuario: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar perfil." });
    }
});

// 4. Listar Posts com foto atualizada do autor
app.get('/api/posts', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.autor_id AS "autorId", p.autor_nome AS "autorNome", 
                   p.conteudo, p.curtidas, p.criado_em AS "criadoEm",
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

// 5. Criar Post
app.post('/api/posts', async (req, res) => {
    const { autorId, autorNome, conteudo } = req.body;
    if (!conteudo) return res.status(400).json({ erro: "Conteúdo obrigatório." });

    const criadoEm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
        const resultado = await pool.query(
            `INSERT INTO posts (autor_id, autor_nome, conteudo, curtidas, criado_em) VALUES ($1, $2, $3, '[]'::jsonb, $4) RETURNING *`,
            [autorId, autorNome, conteudo, criadoEm]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao criar post." });
    }
});

// 6. Curtida Única
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
        res.status(500).json({ erro: "Erro ao curtir post." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR NO AR NA PORTA ${PORT}!`);
});