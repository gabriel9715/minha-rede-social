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

// 1. Cadastro
app.post('/api/cadastrar', (req, res) => {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos!" });

    const db = lerBanco();
    if (db.usuarios.find(u => u.email === email)) {
        return res.status(400).json({ erro: "E-mail já cadastrado." });
    }

    const novoUsuario = {
        id: Date.now(),
        nome,
        email,
        senha: bcrypt.hashSync(senha, 10),
        foto: "https://via.placeholder.com/150/1877f2/ffffff?text=Perfil",
        bio: "Olá! Estou na rede social."
    };

    db.usuarios.push(novoUsuario);
    salvarBanco(db);

    const { senha: _, ...usuarioSemSenha } = novoUsuario;
    res.status(201).json({ mensagem: "Conta criada!", usuario: usuarioSemSenha });
});

// 2. Login
app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    const db = lerBanco();
    const usuario = db.usuarios.find(u => u.email === email);

    if (!usuario || !bcrypt.compareSync(senha, usuario.senha)) {
        return res.status(400).json({ erro: "E-mail ou senha incorretos." });
    }

    const { senha: _, ...usuarioSemSenha } = usuario;
    res.json({ mensagem: "Conectado!", usuario: usuarioSemSenha });
});

// 3. Atualizar Perfil (Foto e Bio)
app.put('/api/usuarios/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { foto, bio } = req.body;
    const db = lerBanco();
    const usuario = db.usuarios.find(u => u.id === id);

    if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

    if (foto) usuario.foto = foto;
    if (bio !== undefined) usuario.bio = bio;
    salvarBanco(db);

    const { senha: _, ...usuarioSemSenha } = usuario;
    res.json({ mensagem: "Perfil atualizado!", usuario: usuarioSemSenha });
});

// 4. Listar Posts
app.get('/api/posts', (req, res) => {
    const db = lerBanco();
    // Vincula a foto mais recente do autor em cada post
    const postsComFotos = db.posts.slice().reverse().map(post => {
        const autor = db.usuarios.find(u => u.id === post.autorId);
        return {
            ...post,
            autorFoto: autor ? autor.foto : "https://via.placeholder.com/150"
        };
    });
    res.json(postsComFotos);
});

// 5. Criar Post
app.post('/api/posts', (req, res) => {
    const { autorId, autorNome, conteudo } = req.body;
    if (!conteudo) return res.status(400).json({ erro: "Conteúdo obrigatório." });

    const db = lerBanco();
    const novoPost = {
        id: Date.now(),
        autorId,
        autorNome,
        conteudo,
        curtidas: [], // Guarda os IDs dos usuários que curtiram
        criadoEm: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    db.posts.push(novoPost);
    salvarBanco(db);
    res.status(201).json(novoPost);
});

// 6. Curtida Única (Curte se não curtiu, descurte se já curtiu)
app.post('/api/posts/:id/curtir', (req, res) => {
    const postId = parseInt(req.params.id);
    const { usuarioId } = req.body;
    const db = lerBanco();
    const post = db.posts.find(p => p.id === postId);

    if (!post) return res.status(404).json({ erro: "Post não encontrado." });
    if (!Array.isArray(post.curtidas)) post.curtidas = [];

    const index = post.curtidas.indexOf(usuarioId);
    if (index === -1) {
        post.curtidas.push(usuarioId); // Adiciona curtida
    } else {
        post.curtidas.splice(index, 1); // Remove se já curtiu
    }

    salvarBanco(db);
    res.json({ totalCurtidas: post.curtidas.length, curtiu: index === -1 });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR NO AR NA PORTA ${PORT}!`);
});