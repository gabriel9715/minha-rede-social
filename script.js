let modoCadastro = false;
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

// Carregar preferências e dados ao abrir
window.onload = () => {
    carregarTema();
    atualizarInterfaceUsuario();
    carregarPosts();
};

// --- MODO ESCURO / CLARO ---
function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('temaEscuro', isDark ? 'sim' : 'nao');
    document.getElementById('themeBtn').innerText = isDark ? '☀️ Modo Claro' : '🌙 Modo Escuro';
}

function carregarTema() {
    if (localStorage.getItem('temaEscuro') === 'sim') {
        document.body.classList.add('dark-mode');
        document.getElementById('themeBtn').innerText = '☀️ Modo Claro';
    }
}

// --- AUTENTICAÇÃO E PERFIL ---
function alternarModoAuth() {
    modoCadastro = !modoCadastro;
    document.getElementById('authNome').style.display = modoCadastro ? 'block' : 'none';
    document.getElementById('authTitle').innerText = modoCadastro ? 'Criar Nova Conta' : 'Entrar na Conta';
    document.getElementById('authBtn').innerText = modoCadastro ? 'Cadastrar' : 'Entrar';
    document.getElementById('toggleText').innerText = modoCadastro ? 'Já tem uma conta?' : 'Não tem conta?';
}

function atualizarInterfaceUsuario() {
    const userStatus = document.getElementById('userStatus');
    const authBox = document.getElementById('authBox');
    const profileBox = document.getElementById('profileBox');

    if (usuarioLogado) {
        userStatus.innerHTML = `Conectado: <strong>${usuarioLogado.nome}</strong>`;
        authBox.style.display = 'none';
        profileBox.style.display = 'block';

        // Preenche o card do perfil
        document.getElementById('profileName').innerText = usuarioLogado.nome;
        document.getElementById('profileBio').innerText = usuarioLogado.bio || 'Sem biografia.';
        document.getElementById('myAvatarImg').src = usuarioLogado.foto || 'https://via.placeholder.com/150';
        document.getElementById('editBio').value = usuarioLogado.bio || '';
    } else {
        userStatus.innerHTML = `<span>Visitante</span>`;
        authBox.style.display = 'block';
        profileBox.style.display = 'none';
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

        if (!resposta.ok) return alert(dados.erro);

        usuarioLogado = dados.usuario;
        localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
        location.reload();
    } catch {
        alert("Erro na conexão com o servidor.");
    }
}

async function salvarPerfil() {
    const foto = document.getElementById('editFoto').value.trim();
    const bio = document.getElementById('editBio').value.trim();

    try {
        const resposta = await fetch(`/api/usuarios/${usuarioLogado.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foto: foto || usuarioLogado.foto, bio })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            usuarioLogado = dados.usuario;
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
            alert('Perfil atualizado com sucesso!');
            location.reload();
        }
    } catch {
        alert("Erro ao salvar perfil.");
    }
}

// --- FEED E POSTS ---
async function carregarPosts() {
    try {
        const resposta = await fetch('/api/posts');
        const posts = await resposta.json();
        const feed = document.getElementById('feed');
        feed.innerHTML = '';

        posts.forEach(post => {
            const curtidasArray = post.curtidas || [];
            const curtiu = usuarioLogado && curtidasArray.includes(usuarioLogado.id);

            const postElement = document.createElement('article');
            postElement.classList.add('card', 'post');
            postElement.innerHTML = `
                <div class="post-header">
                    <img src="${post.autorFoto}" class="avatar-post" alt="Avatar">
                    <div>
                        <strong>${post.autorNome}</strong>
                        <small>• ${post.criadoEm}</small>
                    </div>
                </div>
                <div class="post-body">
                    ${post.conteudo}
                </div>
                <div class="post-footer">
                    <button class="btn-like ${curtiu ? 'liked' : ''}" onclick="curtirPost(${post.id}, this)">
                        ❤️ <span>${curtidasArray.length}</span> curtidas
                    </button>
                </div>
            `;
            feed.appendChild(postElement);
        });
    } catch (err) {
        console.error(err);
    }
}

async function criarPost() {
    if (!usuarioLogado) return alert('Faça login para poder postar!');
    const input = document.getElementById('postContent');
    const conteudo = input.value.trim();
    if (!conteudo) return alert('Digite algo para publicar!');

    try {
        const resposta = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autorId: usuarioLogado.id,
                autorNome: usuarioLogado.nome,
                conteudo
            })
        });

        if (resposta.ok) {
            input.value = '';
            carregarPosts();
        }
    } catch {
        alert("Erro ao publicar.");
    }
}

async function curtirPost(id, botao) {
    if (!usuarioLogado) return alert('Faça login para curtir!');

    try {
        const resposta = await fetch(`/api/posts/${id}/curtir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId: usuarioLogado.id })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            botao.querySelector('span').innerText = dados.totalCurtidas;
            if (dados.curtiu) {
                botao.classList.add('liked');
            } else {
                botao.classList.remove('liked');
            }
        }
    } catch (err) {
        console.error(err);
    }
}