let modoCadastro = false;
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

window.onload = () => {
    atualizarBarraUsuario();
    carregarPosts();
};

function alternarModoAuth() {
    modoCadastro = !modoCadastro;
    const nomeInput = document.getElementById('authNome');
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('authBtn');
    const toggleText = document.getElementById('toggleText');

    if (modoCadastro) {
        nomeInput.style.display = 'block';
        title.innerText = 'Criar Nova Conta';
        btn.innerText = 'Cadastrar';
        toggleText.innerText = 'Já tem uma conta?';
    } else {
        nomeInput.style.display = 'none';
        title.innerText = 'Entrar na Conta';
        btn.innerText = 'Entrar';
        toggleText.innerText = 'Não tem conta?';
    }
}

function atualizarBarraUsuario() {
    const userStatus = document.getElementById('userStatus');
    const authBox = document.getElementById('authBox');

    if (usuarioLogado) {
        userStatus.innerHTML = `Logado como: <strong>${usuarioLogado.nome}</strong> | <a href="javascript:void(0)" onclick="deslogar()" style="color: red; text-decoration: none; margin-left: 8px;">Sair</a>`;
        authBox.innerHTML = `
            <h3>Olá, ${usuarioLogado.nome}!</h3>
            <p style="margin-top: 10px; color: #666; font-size: 0.9rem;">Você está conectado. Deixe sua mensagem no feed!</p>
            <button onclick="deslogar()" style="margin-top: 15px; background: #e4e6eb; color: #333; border: none; padding: 8px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold;">Trocar de Conta</button>
        `;
    } else {
        userStatus.innerHTML = `<span>Visitante</span>`;
    }
}

function deslogar() {
    localStorage.removeItem('usuarioLogado');
    location.reload();
}

async function executarAutenticacao() {
    const email = document.getElementById('authEmail').value;
    const senha = document.getElementById('authSenha').value;
    const nome = document.getElementById('authNome').value;

    const endpoint = modoCadastro ? '/api/cadastrar' : '/api/login';
    const payload = modoCadastro ? { nome, email, senha } : { email, senha };

    try {
        const resposta = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            alert(dados.erro);
            return;
        }

        alert(dados.mensagem);
        usuarioLogado = dados.usuario;
        localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
        location.reload();
    } catch (erro) {
        alert("Erro ao conectar com o servidor.");
    }
}

async function carregarPosts() {
    try {
        const resposta = await fetch('/api/posts');
        const posts = await resposta.json();
        const feed = document.getElementById('feed');
        feed.innerHTML = '';

        if (posts.length === 0) {
            feed.innerHTML = '<p style="text-align: center; color: #777;">Nenhum post ainda. Seja o primeiro a postar!</p>';
            return;
        }

        posts.forEach(post => {
            const iniciais = post.autor.slice(0, 2).toUpperCase();
            const postElement = document.createElement('article');
            postElement.classList.add('card', 'post');
            postElement.innerHTML = `
                <div class="post-header">
                    <div class="avatar">${iniciais}</div>
                    <div>
                        <strong>${post.autor}</strong>
                        <small>• ${post.criadoEm}</small>
                    </div>
                </div>
                <div class="post-body">
                    ${post.conteudo}
                </div>
                <div class="post-footer">
                    <button class="btn-like" onclick="curtirPost(${post.id}, this)">❤️ <span>${post.curtidas}</span> curtidas</button>
                </div>
            `;
            feed.appendChild(postElement);
        });
    } catch (erro) {
        console.error("Erro ao carregar posts:", erro);
    }
}

async function criarPostSimulado() {
    if (!usuarioLogado) {
        alert('Você precisa entrar ou se cadastrar para postar!');
        return;
    }

    const input = document.getElementById('postContent');
    const conteudo = input.value.trim();

    if (conteudo === '') {
        alert('Digite algo antes de publicar!');
        return;
    }

    try {
        const resposta = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autor: usuarioLogado.nome,
                conteudo: conteudo
            })
        });

        if (resposta.ok) {
            input.value = '';
            carregarPosts();
        } else {
            const dados = await resposta.json();
            alert(dados.erro);
        }
    } catch (erro) {
        alert("Erro ao enviar o post.");
    }
}

async function curtirPost(id, botao) {
    try {
        const resposta = await fetch(`/api/posts/${id}/curtir`, { method: 'POST' });
        if (resposta.ok) {
            const span = botao.querySelector('span');
            span.innerText = parseInt(span.innerText) + 1;
        }
    } catch (erro) {
        console.error("Erro ao curtir:", erro);
    }
}