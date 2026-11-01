let modoCadastro = false;
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
let fotoComprimidaTemp = null;
let abaAtual = 'todos'; // 'todos' ou 'salvos'

window.onload = () => {
    carregarTema();
    atualizarInterfaceUsuario();
    carregarPosts();
};

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

function previsualizarFoto(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDimensao = 300;
            let largura = img.width;
            let altura = img.height;

            if (largura > altura) {
                if (largura > maxDimensao) {
                    altura *= maxDimensao / largura;
                    largura = maxDimensao;
                }
            } else {
                if (altura > maxDimensao) {
                    largura *= maxDimensao / altura;
                    altura = maxDimensao;
                }
            }

            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, largura, altura);

            fotoComprimidaTemp = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('myAvatarImg').src = fotoComprimidaTemp;
        };
        img.src = e.target.result;
    };
    leitor.readAsDataURL(arquivo);
}

async function salvarPerfil() {
    if (!usuarioLogado) return;
    const bio = document.getElementById('editBio').value.trim();
    const fotoFinal = fotoComprimidaTemp || usuarioLogado.foto;

    try {
        const resposta = await fetch(`/api/usuarios/${usuarioLogado.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foto: fotoFinal, bio })
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

// Trocar entre Feed Geral e Posts Salvos
function trocarAbaFeed(aba) {
    abaAtual = aba;
    document.getElementById('tabFeedBtn').classList.toggle('active', aba === 'todos');
    document.getElementById('tabSalvosBtn').classList.toggle('active', aba === 'salvos');

    const feedTitle = document.getElementById('feedTitle');
    const boxCriarPost = document.getElementById('boxCriarPost');

    if (aba === 'salvos') {
        feedTitle.innerText = "Meus Posts Salvos 🔖";
        boxCriarPost.style.display = 'none';
    } else {
        feedTitle.innerText = "Feed Recente 🌐";
        boxCriarPost.style.display = 'block';
    }

    carregarPosts();
}

async function carregarPosts() {
    try {
        const resposta = await fetch('/api/posts');
        let posts = await resposta.json();
        const feed = document.getElementById('feed');
        feed.innerHTML = '';

        const salvosDoUsuario = (usuarioLogado && usuarioLogado.salvos) ? usuarioLogado.salvos : [];

        // Filtra caso esteja na aba de salvos
        if (abaAtual === 'salvos') {
            posts = posts.filter(p => salvosDoUsuario.includes(parseInt(p.id)));
        }

        if (posts.length === 0) {
            feed.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">
                ${abaAtual === 'salvos' ? 'Você ainda não salvou nenhum post.' : 'Nenhum post publicado ainda.'}
            </p>`;
            return;
        }

        posts.forEach(post => {
            const curtidasArray = post.curtidas || [];
            const comentariosArray = post.comentarios || [];
            const curtiu = usuarioLogado && curtidasArray.includes(usuarioLogado.id);
            const salvou = salvosDoUsuario.includes(parseInt(post.id));

            // Gera o HTML dos comentários já existentes
            let comentariosHTML = '';
            comentariosArray.forEach(c => {
                comentariosHTML += `
                    <div class="comment-item">
                        <strong>${c.autorNome}:</strong> <span>${c.texto}</span>
                    </div>
                `;
            });

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
                    <button class="btn-action ${curtiu ? 'liked' : ''}" onclick="curtirPost(${post.id}, this)">
                        ❤️ <span>${curtidasArray.length}</span> curtidas
                    </button>
                    <button class="btn-action ${salvou ? 'saved' : ''}" onclick="salvarPost(${post.id}, this)">
                        🔖 <span>${salvou ? 'Salvo' : 'Salvar'}</span>
                    </button>
                </div>

                <!-- Seção de Comentários -->
                <div class="comments-section">
                    <div id="comments-list-${post.id}">
                        ${comentariosHTML}
                    </div>
                    ${usuarioLogado ? `
                        <div class="comment-input-box">
                            <input type="text" id="comment-input-${post.id}" placeholder="Escreva um comentário...">
                            <button onclick="adicionarComentario(${post.id})">Enviar</button>
                        </div>
                    ` : ''}
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
            botao.classList.toggle('liked', dados.curtiu);
        }
    } catch (err) {
        console.error(err);
    }
}

// Salvar / Remover dos Favoritos
async function salvarPost(id, botao) {
    if (!usuarioLogado) return alert('Faça login para salvar publicações!');

    try {
        const resposta = await fetch(`/api/posts/${id}/salvar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId: usuarioLogado.id })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            usuarioLogado.salvos = dados.salvos;
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
            botao.classList.toggle('saved', dados.salvou);
            botao.querySelector('span').innerText = dados.salvou ? 'Salvo' : 'Salvar';

            if (abaAtual === 'salvos') carregarPosts();
        }
    } catch (err) {
        console.error(err);
    }
}

// Comentar no Post
async function adicionarComentario(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const texto = input.value.trim();
    if (!texto) return;

    try {
        const resposta = await fetch(`/api/posts/${postId}/comentar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autorNome: usuarioLogado.nome,
                texto
            })
        });
        const novoComentario = await resposta.json();

        if (resposta.ok) {
            input.value = '';
            const lista = document.getElementById(`comments-list-${postId}`);
            const item = document.createElement('div');
            item.classList.add('comment-item');
            item.innerHTML = `<strong>${novoComentario.autorNome}:</strong> <span>${novoComentario.texto}</span>`;
            lista.appendChild(item);
        }
    } catch (err) {
        console.error(err);
    }
}