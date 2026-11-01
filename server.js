const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database(path.join(__dirname, 'banco.db'), ...
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve o HTML, CSS e JS direto do seu computador
app.use(express.static(__dirname));

// Cria e conecta ao arquivo de banco de dados
const db = new sqlite3.Database(path.join(__dirname, 'banco.db'), (err) => {
    if (err) console.error("Erro ao abrir banco de dados:", err);
    else console.log("Conectado ao banco de dados SQLite com sucesso!");
});

// Cria as tabelas de Usuários e Postagens
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            autor TEXT NOT NULL,
            conteudo TEXT NOT NULL,
            curtidas INTEGER DEFAULT 0,
            criadoEm TEXT NOT NULL
        )
    `);
});

// 1. Cadastrar Usuário com senha criptografada
app.post('/api/cadastrar', (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos!" });
    }

    const senhaHash = bcrypt.hashSync(senha, 10);
    const query = `INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)`;
    
    db.run(query, [nome, email, senhaHash], function(err) {
        if (err) {
            return res.status(400).json({ erro: "E-mail já cadastrado." });
        }
        res.status(201).json({ mensagem: "Conta criada com sucesso!", usuario: { id: this.lastID, nome, email } });
    });
});

// 2. Fazer Login
app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos!" });
    }

    const query = `SELECT * FROM usuarios WHERE email = ?`;
    db.get(query, [email], (err, usuario) => {
        if (err || !usuario) {
            return res.status(400).json({ erro: "E-mail ou senha incorretos." });
        }

        const senhaValida = bcrypt.compareSync(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(400).json({ erro: "E-mail ou senha incorretos." });
        }

        res.json({ mensagem: "Login realizado com sucesso!", usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
    });
});

// 3. Pegar todos os posts salvos
app.get('/api/posts', (req, res) => {
    db.all(`SELECT * FROM posts ORDER BY id DESC`, [], (err, posts) => {
        if (err) return res.status(500).json({ erro: "Erro ao buscar posts." });
        res.json(posts);
    });
});

// 4. Salvar um novo post no banco
app.post('/api/posts', (req, res) => {
    const { autor, conteudo } = req.body;
    if (!autor || !conteudo) {
        return res.status(400).json({ erro: "Conteúdo e autor são obrigatórios." });
    }

    const criadoEm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const query = `INSERT INTO posts (autor, conteudo, criadoEm) VALUES (?, ?, ?)`;

    db.run(query, [autor, conteudo, criadoEm], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao salvar post." });
        res.status(201).json({ id: this.lastID, autor, conteudo, curtidas: 0, criadoEm });
    });
});

// 5. Curtir post no banco
app.post('/api/posts/:id/curtir', (req, res) => {
    const id = req.params.id;
    db.run(`UPDATE posts SET curtidas = curtidas + 1 WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao curtir post." });
        res.json({ sucesso: true });
    });
});

// Inicia o servidor na porta 3000
app.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`SERVIDOR NO AR!`);
    console.log(`Acesse no navegador: http://localhost:${PORT}`);
    console.log(`===========================================\n`);
});