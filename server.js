const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'banco.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Inicializa o arquivo de banco JSON caso não exista
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ usuarios: [], posts: [] }, null, 2));
}

function lerBanco() {
    try {
        const dados = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(dados);
    } catch {
        return { usuarios: [], posts: [] };
    }
}

function salvarBanco(dados) {
    fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2));
}

// 1. Cadastrar Usuário
app.post('/api/cadastrar', (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos!" });
    }

    const db = lerBanco();
    const usuarioExistente = db.usuarios.find(u => u.email === email);
    if (usuarioExistente) {
        return res.status(400).json({ erro: "E-mail já cadastrado." });
    }

    const senhaHash = bcrypt.hashSync(senha, 10);
    const novoUsuario = { id: Date.now(), nome, email, senha: senhaHash };
    db.usuarios.push(novoUsuario);
    salvarBanco(db);

    res.status(201).json({
        mensagem: "Conta criada com sucesso!",
        usuario: { id: novoUsuario.id, nome, email }
    });
});

// 2. Fazer Login
app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos!" });
    }

    const db = lerBanco();
    const usuario = db.usuarios.find(u => u.email === email);
    if (!usuario) {
        return res.status(400).json({ erro: "E-mail ou senha incorretos." });
    }

    const senhaValida = bcrypt.compareSync(senha, usuario.senha);
    if (!senhaValida) {
        return res.status(400).json({ erro: "E-mail ou senha incorretos." });
    }

    res.json({
        mensagem: "Login realizado com sucesso!",
        usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email }
    });
});

// 3. Listar Posts
app.get('/api/posts', (req, res) => {
    const db = lerBanco();
    // Envia os posts do mais recente para o mais antigo
    res.json(db.posts.slice().reverse());
});

// 4. Salvar Post
app.post('/api/posts', (req, res) => {
    const { autor, conteudo } = req.body;
    if (!autor || !conteudo) {
        return res.status(400).json({ erro: "Conteúdo e autor são obrigatórios." });
    }

    const db = lerBanco();
    const novoPost = {
        id: Date.now(),
        autor,
        conteudo,
        curtidas: 0,
        criadoEm: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    db.posts.push(novoPost);
    salvarBanco(db);

    res.status(201).json(novoPost);
});

// 5. Curtir Post
app.post('/api/posts/:id/curtir', (req, res) => {
    const id = parseInt(req.params.id);
    const db = lerBanco();
    const post = db.posts.find(p => p.id === id);

    if (post) {
        post.curtidas += 1;
        salvarBanco(db);
        return res.json({ sucesso: true });
    }

    res.status(404).json({ erro: "Post não encontrado." });
});

// Inicia o servidor ouvindo em 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n===========================================`);
    console.log(`SERVIDOR NO AR NA PORTA ${PORT}!`);
    console.log(`===========================================\n`);
});