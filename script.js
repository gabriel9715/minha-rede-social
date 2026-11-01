let modoCadastro = false;
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
let fotoPerfilComprimidaTemp = null;
let postMidiaTemp = null;
let abaAtual = 'todos';

// Variáveis para o Player de Story
let storiesCarregados = [];
let timerStoryProgress = null;

window.onload = async () => {
    carregarTema();
    if (usuarioLogado) {
        await sincronizarPerfilDoServidor();
    }
    atualizarInterfaceUsuario();
    carregarStories();
    carregarPosts();
};

async function sincronizarPerfilDoServidor() {
    try {
        const resposta = await fetch(`/api/usuarios/${usuarioLogado.id}/perfil`);
        if (resposta.ok) {
            usuarioLogado = await resposta.json();
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
        }
    } catch (e) {
        console.warn("Não foi possível sincronizar perfil agora:", e);
    }
}

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
    const myStoryAvatar = document.getElementById('myStoryAvatar');

    if (usuarioLogado) {
        userStatus.innerHTML = `Conectado: <strong>${usuarioLogado.nome}</strong>`;
        authBox.style.display = 'none';
        profileBox.style.display = 'block';

        document.getElementById('profileName').innerText = usuarioLogado.nome;
        document.getElementById('profileBio').innerText = usuarioLogado.bio || 'Sem biografia.';
        document.getElementById('myAvatarImg').src = usuarioLogado.foto || 'https://via.placeholder.com/150';
        myStoryAvatar.src = usuarioLogado.foto || 'https://via.placeholder.com/150';
        document.getElementById('editBio').value = usuarioLogado.bio || '';

        const seguidores = usuarioLogado.seguidores || [];
        const seguindo = usuarioLogado.seguindo || [];
        document.getElementById('statSeguidores').innerText = seguidores.length;
        document.getElementById('statSeguindo').innerText = seguindo.length;
    } else {
        userStatus.innerHTML = `<span>Visitante</span>`;
        authBox.style.display = 'block';
        profileBox.style.display = 'none';
        myStoryAvatar.src = 'https://via.placeholder.com/150';
    }
}

function deslogar() {
    localStorage.removeItem('usuarioLogado');
    location.reload();
}

async function executarAutenticacao() {
    const email = document.getElementById('authEmail').value.trim();
    const senha = document.getElementById('authSenha').value.trim();
    const nome = document.getElementById('authNome').value.trim();

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

function previsualizarFotoPerfil(event) {
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

            fotoPerfilComprimidaTemp = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('myAvatarImg').src = fotoPerfilComprimidaTemp;
        };
        img.src = e.target.result;
    };
    leitor.readAsDataURL(arquivo);
}

async function salvarPerfil() {
    if (!usuarioLogado) return;
    const bio = document.getElementById('editBio').value.trim();
    const fotoFinal = fotoPerfilComprimidaTemp || usuarioLogado.foto;

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

// ================= LÓGICA DE STORIES =================

function acionarUploadStory() {
    if (!usuarioLogado) return alert("Faça login para postar um Story!");
    document.getElementById('storyFileInput').click();
}

async function enviarStory(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;

    if (arquivo.size > 15 * 1024 * 1024) {
        alert("O Story deve ter no máximo 15MB!");
        event.target.value = '';
        return;
    }

    const leitor = new FileReader();

    if (arquivo.type.startsWith('image/')) {
        leitor.onload = async function(e) {
            const img = new Image();
            img.onload = async function() {
                const canvas = document.createElement('canvas');
                const maxDim = 1080;
                let w = img.width;
                let h = img.height;

                if (w > h && w > maxDim) {
                    h *= maxDim / w;
                    w = maxDim;
                } else if (h > maxDim) {
                    w *= maxDim / h;
                    h = maxDim;
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                await postarStoryServidor(base64, 'imagem');
            };
            img.src = e.target.result;
        };
        leitor.readAsDataURL(arquivo);

    } else if (arquivo.type.startsWith('video/')) {
        leitor.onload = async function(e) {
            await postarStoryServidor(e.target.result, 'video');
        };
        leitor.readAsDataURL(arquivo);
    }

    event.target.value = '';
}

async function postarStoryServidor(midiaUrl, midiaTipo) {
    try {
        const resposta = await fetch('/api/stories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autorId: parseInt(usuarioLogado.id),
                autorNome: usuarioLogado.nome,
                midiaUrl,
                midiaTipo
            })
        });

        if (resposta.ok) {
            alert("Story publicado com sucesso! Ele desaparecerá em 24h.");
            carregarStories();
        } else {
            alert("Erro ao publicar Story.");
        }
    } catch {
        alert("Erro na conexão ao enviar Story.");
    }
}

async function carregarStories() {
    try {
        const resposta = await fetch('/api/stories');
        storiesCarregados = await resposta.json();
        const storiesList = document.getElementById('storiesList');
        storiesList.innerHTML = '';

        const bloqueados = (usuarioLogado && usuarioLogado.bloqueados) ? usuarioLogado.bloqueados : [];

        // Agrupa o story mais recente de cada usuário (exceto bloqueados)
        const usuariosVistos = new Set();
        
        storiesCarregados.forEach(story => {
            if (bloqueados.includes(parseInt(story.autorId))) return;
            if (usuariosVistos.has(story.autorId)) return;
            usuariosVistos.add(story.autorId);

            const storyElement = document.createElement('div');
            storyElement.classList.add('story-item');
            storyElement.onclick = () => abrirStoryModal(story);

            storyElement.innerHTML = `
                <div class="story-avatar-wrap">
                    <img src="${story.autorFoto}" alt="${story.autorNome}">
                </div>
                <small>${story.autorNome}</small>
            `;
            storiesList.appendChild(storyElement);
        });
    } catch (err) {
        console.error("Erro ao carregar stories:", err);
    }
}

function abrirStoryModal(story) {
    const modal = document.getElementById('storyModal');
    const avatar = document.getElementById('modalStoryAvatar');
    const author = document.getElementById('modalStoryAuthor');
    const time = document.getElementById('modalStoryTime');
    const content = document.getElementById('modalStoryContent');
    const progressFill = document.getElementById('storyProgressFill');

    avatar.src = story.autorFoto;
    author.innerText = story.autorNome;

    // Calcula há quantas horas foi postado
    const horasAtras = Math.floor((Date.now() - parseInt(story.criadoEm)) / (1000 * 60 * 60));
    time.innerText = `• ${horasAtras === 0 ? 'Agora' : horasAtras + 'h'}`;

    if (story.midiaTipo === 'video') {
        content.innerHTML = `<video id="activeStoryVideo" src="${story.midiaUrl}" autoplay playsinline></video>`;
    } else {
        content.innerHTML = `<img src="${story.midiaUrl}" alt="Story">`;
    }

    modal.style.display = 'flex';
    iniciarTemporizadorStory(story.midiaTipo);
}

function iniciarTemporizadorStory(tipo) {
    const progressFill = document.getElementById('storyProgressFill');
    progressFill.style.width = '0%';

    let duracaoSegundos = tipo === 'video' ? 10 : 5; // 5s para imagem ou tempo fixo para vídeo
    let progresso = 0;
    const intervalo = 50;
    const incremento = 100 / ((duracaoSegundos * 1000) / intervalo);

    if (timerStoryProgress) clearInterval(timerStoryProgress);

    timerStoryProgress = setInterval(() => {
        progresso += incremento;
        progressFill.style.width = `${progresso}%`;

        if (progresso >= 100) {
            fecharStoryModalDirect();
        }
    }, intervalo);
}

function fecharStoryModalDirect() {
    if (timerStoryProgress) clearInterval(timerStoryProgress);
    const modal = document.getElementById('storyModal');
    const content = document.getElementById('modalStoryContent');
    content.innerHTML = '';
    modal.style.display = 'none';
}

function fecharStoryModal(event) {
    if (event.target.id === 'storyModal') {
        fecharStoryModalDirect();
    }
}

// ================= RESTANTE DO FEED =================

function previsualizarMidiaPost(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;

    const previewContainer = document.getElementById('mediaPreviewContainer');
    const previewContent = document.getElementById('mediaPreviewContent');
    previewContent.innerHTML = '';

    if (arquivo.size > 15 * 1024 * 1024) {
        alert("O arquivo é muito grande! Escolha uma foto ou vídeo curto de até 15MB.");
        event.target.value = '';
        return;
    }

    const leitor = new FileReader();

    if (arquivo.type.startsWith('image/')) {
        leitor.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const maxDim = 1080;
                let w = img.width;
                let h = img.height;

                if (w > h && w > maxDim) {
                    h *= maxDim / w;
                    w = maxDim;
                } else if (h > maxDim) {
                    w *= maxDim / h;
                    h = maxDim;
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                const base64Comprimido = canvas.toDataURL('image/jpeg', 0.8);
                postMidiaTemp = { url: base64Comprimido, tipo: 'imagem' };

                previewContent.innerHTML = `<img src="${base64Comprimido}" alt="Pré-visualização">`;
                previewContainer.style.display = 'flex';
            };
            img.src = e.target.result;
        };
        leitor.readAsDataURL(arquivo);

    } else if (arquivo.type.startsWith('video/')) {
        leitor.onload = function(e) {
            postMidiaTemp = { url: e.target.result, tipo: 'video' };
            previewContent.innerHTML = `<video src="${e.target.result}" controls autoplay muted></video>`;
            previewContainer.style.display = 'flex';
        };
        leitor.readAsDataURL(arquivo);
    }
}

function removerMidiaAnexada() {
    postMidiaTemp = null;
    document.getElementById('postMediaInput').value = '';
    document.getElementById('mediaPreviewContent').innerHTML = '';
    document.getElementById('mediaPreviewContainer').style.display = 'none';
}

function trocarAbaFeed(aba) {
    abaAtual = aba;
    document.getElementById('tabFeedBtn').classList.toggle('active', aba === 'todos');
    document.getElementById('tabSalvosBtn').classList.toggle('active', aba === 'salvos');

    const feedTitle = document.getElementById('feedTitle');
    const boxCriarPost = document.getElementById('boxCriarPost');
    const storiesBar = document.getElementById('storiesBar');

    if (aba === 'salvos') {
        feedTitle.innerText = "Meus Posts Salvos 🔖";
        boxCriarPost.style.display = 'none';
        storiesBar.style.display = 'none';
    } else {
        feedTitle.innerText = "Feed Recente 🌐";
        boxCriarPost.style.display = 'block';
        storiesBar.style.display = 'flex';
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
        const bloqueadosDoUsuario = (usuarioLogado && usuarioLogado.bloqueados) ? usuarioLogado.bloqueados : [];
        const seguindoDoUsuario = (usuarioLogado && usuarioLogado.seguindo) ? usuarioLogado.seguindo : [];

        posts = posts.filter(p => !bloqueadosDoUsuario.includes(parseInt(p.autorId)));

        if (abaAtual === 'salvos') {
            posts = posts.filter(p => salvosDoUsuario.includes(parseInt(p.id)));
        }

        if (posts.length === 0) {
            feed.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">
                ${abaAtual === 'salvos' ? 'Você ainda não salvou nenhum post.' : 'Nenhum post disponível no momento.'}
            </p>`;
            return;
        }

        posts.forEach(post => {
            const curtidasArray = post.curtidas || [];
            const comentariosArray = post.comentarios || [];
            const curtiu = usuarioLogado && curtidasArray.includes(parseInt(usuarioLogado.id));
            const salvou = salvosDoUsuario.includes(parseInt(post.id));
            const ehMeuPost = usuarioLogado && parseInt(post.autorId) === parseInt(usuarioLogado.id);
            const jaSegue = seguindoDoUsuario.includes(parseInt(post.autorId));

            let midiaHTML = '';
            if (post.midiaUrl) {
                if (post.midiaTipo === 'video') {
                    midiaHTML = `
                        <div class="post-media-container">
                            <video src="${post.midiaUrl}" controls playsinline preload="metadata"></video>
                        </div>
                    `;
                } else {
                    midiaHTML = `
                        <div class="post-media-container">
                            <img src="${post.midiaUrl}" alt="Mídia do Post" loading="lazy">
                        </div>
                    `;
                }
            }

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
                    <div class="post-user-info">
                        <img src="${post.autorFoto}" class="avatar-post" alt="Avatar">
                        <div>
                            <strong>${post.autorNome}</strong>
                            <small>• ${post.criadoEm}</small>
                        </div>
                    </div>
                    
                    ${(usuarioLogado && !ehMeuPost) ? `
                        <div class="post-user-actions">
                            <button class="btn-follow ${jaSegue ? 'following' : ''}" onclick="alternarSeguir(${post.autorId}, this)">
                                ${jaSegue ? 'Seguindo' : '+ Seguir'}
                            </button>
                            <button class="btn-block" onclick="bloquearUsuario(${post.autorId}, '${post.autorNome}')" title="Bloquear usuário">
                                🚫
                            </button>
                        </div>
                    ` : ''}
                </div>

                ${post.conteudo ? `<div class="post-body">${post.conteudo}</div>` : ''}
                
                ${midiaHTML}

                <div class="post-footer">
                    <button class="btn-action ${curtiu ? 'liked' : ''}" onclick="curtirPost(${post.id}, this)">
                        ❤️ <span>${curtidasArray.length}</span> curtidas
                    </button>
                    <button class="btn-action ${salvou ? 'saved' : ''}" onclick="salvarPost(${post.id}, this)">
                        🔖 <span>${salvou ? 'Salvo' : 'Salvar'}</span>
                    </button>
                </div>

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

    if (!conteudo && !postMidiaTemp) {
        return alert('Escreva uma mensagem ou anexe uma foto/vídeo!');
    }

    const payload = {
        autorId: parseInt(usuarioLogado.id),
        autorNome: usuarioLogado.nome,
        conteudo: conteudo,
        midiaUrl: postMidiaTemp ? postMidiaTemp.url : null,
        midiaTipo: postMidiaTemp ? postMidiaTemp.tipo : null
    };

    try {
        const resposta = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (resposta.ok) {
            input.value = '';
            removerMidiaAnexada();
            carregarPosts();
        } else {
            const erroData = await resposta.json();
            alert(erroData.erro || "Não foi possível publicar.");
        }
    } catch {
        alert("Erro na conexão ao enviar a publicação.");
    }
}

async function curtirPost(id, botao) {
    if (!usuarioLogado) return alert('Faça login para curtir!');

    try {
        const resposta = await fetch(`/api/posts/${id}/curtir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId: parseInt(usuarioLogado.id) })
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

async function salvarPost(id, botao) {
    if (!usuarioLogado) return alert('Faça login para salvar publicações!');

    try {
        const resposta = await fetch(`/api/posts/${id}/salvar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId: parseInt(usuarioLogado.id) })
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

async function alternarSeguir(alvoId, botao) {
    if (!usuarioLogado) return alert('Faça login para seguir pessoas!');

    try {
        const resposta = await fetch(`/api/usuarios/${alvoId}/seguir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meuId: parseInt(usuarioLogado.id) })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            usuarioLogado.seguindo = dados.seguindo;
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
            
            botao.classList.toggle('following', dados.seguindoAgora);
            botao.innerText = dados.seguindoAgora ? 'Seguindo' : '+ Seguir';
            
            document.getElementById('statSeguindo').innerText = dados.seguindo.length;
        } else {
            alert(dados.erro);
        }
    } catch {
        alert("Erro ao seguir usuário.");
    }
}

async function bloquearUsuario(alvoId, nomeAlvo) {
    if (!usuarioLogado) return;
    if (!confirm(`Deseja realmente bloquear ${nomeAlvo}? As postagens dele sumirão do seu feed.`)) return;

    try {
        const resposta = await fetch(`/api/usuarios/${alvoId}/bloquear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meuId: parseInt(usuarioLogado.id) })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            usuarioLogado.bloqueados = dados.bloqueados;
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
            alert(`${nomeAlvo} foi bloqueado.`);
            carregarStories();
            carregarPosts();
        }
    } catch {
        alert("Erro ao bloquear usuário.");
    }
}

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