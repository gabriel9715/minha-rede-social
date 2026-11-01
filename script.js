let modoCadastro = false;
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
let fotoPerfilComprimidaTemp = null;
let postMidiaTemp = null;

// Abas e Navegação Principal
let abaAtiva = 'feed'; // 'feed' | 'mensagens' | 'notificacoes' | 'salvos'

// Stories
let storiesCarregados = [];
let timerStoryProgress = null;

// Chat / Direct
let contatoAtivoDirect = null; // { id, nome }
let timerPollingDirect = null;

// Polling de Notificações
let timerPollingNotif = null;

window.onload = async () => {
    carregarTema();
    if (usuarioLogado) {
        await sincronizarPerfilDoServidor();
        iniciarMonitoramentoNotificacoes();
    }
    atualizarInterfaceUsuario();
    mudarAbaPrincipal('feed');
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

// ================= CONTROLE DE ABAS PRINCIPAIS =================
function mudarAbaPrincipal(novaAba) {
    abaAtiva = novaAba;

    // Atualiza botões superiores
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (document.getElementById(`btnTab${capitalizar(novaAba)}`)) {
        document.getElementById(`btnTab${capitalizar(novaAba)}`).classList.add('active');
    }

    // Esconde todas as visualizações
    document.getElementById('viewFeed').style.display = 'none';
    document.getElementById('viewMensagens').style.display = 'none';
    document.getElementById('viewNotificacoes').style.display = 'none';
    document.getElementById('viewSalvos').style.display = 'none';

    // Para o polling do chat caso saia da aba de mensagens
    if (novaAba !== 'mensagens' && timerPollingDirect) {
        clearInterval(timerPollingDirect);
        contatoAtivoDirect = null;
    }

    if (novaAba === 'feed') {
        document.getElementById('viewFeed').style.display = 'block';
        carregarStories();
        carregarPosts();
    } else if (novaAba === 'mensagens') {
        if (!usuarioLogado) return alert("Faça login para acessar suas mensagens!");
        document.getElementById('viewMensagens').style.display = 'block';
        carregarContatosDirect();
    } else if (novaAba === 'notificacoes') {
        if (!usuarioLogado) return alert("Faça login para ver suas notificações!");
        document.getElementById('viewNotificacoes').style.display = 'block';
        carregarNotificacoes();
    } else if (novaAba === 'salvos') {
        if (!usuarioLogado) return alert("Faça login para ver seus posts salvos!");
        document.getElementById('viewSalvos').style.display = 'block';
        carregarPostsSalvos();
    }
}

function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ================= NOTIFICAÇÕES =================
function iniciarMonitoramentoNotificacoes() {
    verificarContadorNotificacoes();
    if (timerPollingNotif) clearInterval(timerPollingNotif);
    timerPollingNotif = setInterval(verificarContadorNotificacoes, 6000); // Checa a cada 6 segundos
}

async function verificarContadorNotificacoes() {
    if (!usuarioLogado) return;
    try {
        const resposta = await fetch(`/api/notificacoes/${usuarioLogado.id}`);
        const notificacoes = await resposta.json();
        const badge = document.getElementById('badgeNotificacoes');

        if (notificacoes.length > 0) {
            badge.innerText = notificacoes.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch {}
}

async function carregarNotificacoes() {
    const list = document.getElementById('notificacoesList');
    list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Carregando...</p>';

    try {
        const resposta = await fetch(`/api/notificacoes/${usuarioLogado.id}`);
        const notificacoes = await resposta.json();
        list.innerHTML = '';

        if (notificacoes.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhuma notificação por aqui ainda.</p>';
            return;
        }

        notificacoes.forEach(n => {
            const item = document.createElement('div');
            item.classList.add('notif-item');

            let icone = '🔔';
            if (n.tipo === 'curtida') {
                item.classList.add('notif-like');
                icone = '❤️';
            } else if (n.tipo === 'salvou') {
                item.classList.add('notif-save');
                icone = '🔖';
            } else if (n.tipo === 'comentario') {
                item.classList.add('notif-comment');
                icone = '💬';
            } else if (n.tipo === 'seguiu') {
                icone = '➕';
            }

            const hora = new Date(parseInt(n.criadoEm)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <img src="${n.autorAcaoFoto || 'https://via.placeholder.com/150'}" alt="${n.autorAcaoNome}">
                <div class="notif-content">
                    <span><strong>${n.autorAcaoNome}</strong> ${n.detalhe} ${icone}</span>
                    <small>Hoje às ${hora}</small>
                </div>
            `;
            list.appendChild(item);
        });
    } catch {
        list.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar notificações.</p>';
    }
}

async function limparNotificacoes() {
    if (!confirm("Deseja apagar todas as notificações?")) return;
    try {
        await fetch(`/api/notificacoes/${usuarioLogado.id}`, { method: 'DELETE' });
        document.getElementById('badgeNotificacoes').style.display = 'none';
        carregarNotificacoes();
    } catch {
        alert("Erro ao limpar notificações.");
    }
}

// ================= ABA DE MENSAGENS (DIRECT) =================
async function carregarContatosDirect() {
    const list = document.getElementById('directContactsList');
    list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 15px;">Carregando...</p>';

    try {
        const resposta = await fetch(`/api/chat/contatos/${usuarioLogado.id}`);
        const contatos = await resposta.json();
        list.innerHTML = '';

        if (contatos.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 15px;">Nenhum usuário disponível.</p>';
            return;
        }

        contatos.forEach(c => {
            const item = document.createElement('div');
            item.classList.add('direct-contact-item');
            if (contatoAtivoDirect && contatoAtivoDirect.id === parseInt(c.id)) {
                item.classList.add('active');
            }

            item.onclick = () => abrirConversaDirect(c.id, c.nome);
            item.innerHTML = `
                <img src="${c.foto || 'https://via.placeholder.com/150'}" alt="${c.nome}">
                <div>
                    <strong>${c.nome}</strong>
                    <br><small style="color: var(--text-muted);">Conversar</small>
                </div>
            `;
            list.appendChild(item);
        });
    } catch {
        list.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar contatos.</p>';
    }
}

async function abrirConversaDirect(contatoId, contatoNome) {
    contatoAtivoDirect = { id: parseInt(contatoId), nome: contatoNome };

    document.getElementById('directChatEmpty').style.display = 'none';
    const activeView = document.getElementById('directChatActive');
    activeView.style.display = 'flex';

    document.getElementById('directActiveUserName').innerText = `Conversando com ${contatoNome}`;

    // Marca o contato ativo na sidebar
    carregarContatosDirect();

    await buscarMensagensDirect();

    if (timerPollingDirect) clearInterval(timerPollingDirect);
    timerPollingDirect = setInterval(buscarMensagensDirect, 3000);
}

async function buscarMensagensDirect() {
    if (!contatoAtivoDirect || !usuarioLogado) return;

    try {
        const resposta = await fetch(`/api/chat/conversa?user1=${usuarioLogado.id}&user2=${contatoAtivoDirect.id}`);
        const mensagens = await resposta.json();
        const container = document.getElementById('directMessagesBody');
        container.innerHTML = '';

        if (mensagens.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">Diga olá para iniciar a conversa! 👋</p>';
            return;
        }

        mensagens.forEach(m => {
            const ehMeu = parseInt(m.remetenteId) === parseInt(usuarioLogado.id);
            const hora = new Date(parseInt(m.criadoEm)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const balão = document.createElement('div');
            balão.classList.add('msg-bubble', ehMeu ? 'sent' : 'received');
            balão.innerHTML = `
                <span>${m.texto}</span>
                <small>${hora}</small>
            `;
            container.appendChild(balão);
        });

        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.warn("Erro ao buscar mensagens:", e);
    }
}

async function enviarMensagemDirect() {
    const input = document.getElementById('directMsgInput');
    const texto = input.value.trim();
    if (!texto || !contatoAtivoDirect) return;

    input.value = '';

    try {
        const resposta = await fetch('/api/chat/mensagens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                remetenteId: parseInt(usuarioLogado.id),
                destinatarioId: contatoAtivoDirect.id,
                texto: texto
            })
        });

        if (resposta.ok) {
            buscarMensagensDirect();
        } else {
            const erroData = await resposta.json();
            alert(erroData.erro || "Erro ao enviar mensagem.");
        }
    } catch {
        alert("Erro na conexão ao enviar mensagem.");
    }
}

function checarEnterDirect(event) {
    if (event.key === 'Enter') {
        enviarMensagemDirect();
    }
}

// ================= GERAL, PERFIL & AUTENTICAÇÃO =================
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
    const mainNavTabs = document.getElementById('mainNavTabs');
    const myStoryAvatar = document.getElementById('myStoryAvatar');

    if (usuarioLogado) {
        userStatus.innerHTML = `Conectado: <strong>${usuarioLogado.nome}</strong>`;
        authBox.style.display = 'none';
        profileBox.style.display = 'block';
        mainNavTabs.style.display = 'flex';

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
        mainNavTabs.style.display = 'none';
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

// ================= STORIES =================
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
            alert("Story publicado com sucesso! Ele sumirá em 24h.");
            carregarStories();
        }
    } catch {
        alert("Erro ao enviar Story.");
    }
}

async function carregarStories() {
    try {
        const resposta = await fetch('/api/stories');
        storiesCarregados = await resposta.json();
        const storiesList = document.getElementById('storiesList');
        storiesList.innerHTML = '';

        const bloqueados = (usuarioLogado && usuarioLogado.bloqueados) ? usuarioLogado.bloqueados : [];
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
        console.error("Erro stories:", err);
    }
}

function abrirStoryModal(story) {
    const modal = document.getElementById('storyModal');
    const avatar = document.getElementById('modalStoryAvatar');
    const author = document.getElementById('modalStoryAuthor');
    const time = document.getElementById('modalStoryTime');
    const content = document.getElementById('modalStoryContent');

    avatar.src = story.autorFoto;
    author.innerText = story.autorNome;

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

    let duracaoSegundos = tipo === 'video' ? 10 : 5;
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

// ================= FEED E POSTS =================
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

async function carregarPosts() {
    try {
        const resposta = await fetch('/api/posts');
        let posts = await resposta.json();
        const feed = document.getElementById('feed');
        feed.innerHTML = '';

        const bloqueadosDoUsuario = (usuarioLogado && usuarioLogado.bloqueados) ? usuarioLogado.bloqueados : [];
        posts = posts.filter(p => !bloqueadosDoUsuario.includes(parseInt(p.autorId)));

        if (posts.length === 0) {
            feed.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum post publicado ainda.</p>`;
            return;
        }

        renderizarPostsNoElemento(posts, feed);
    } catch (err) {
        console.error(err);
    }
}

async function carregarPostsSalvos() {
    try {
        const resposta = await fetch('/api/posts');
        let posts = await resposta.json();
        const feedSalvos = document.getElementById('feedSalvos');
        feedSalvos.innerHTML = '';

        const salvosDoUsuario = (usuarioLogado && usuarioLogado.salvos) ? usuarioLogado.salvos : [];
        posts = posts.filter(p => salvosDoUsuario.includes(parseInt(p.id)));

        if (posts.length === 0) {
            feedSalvos.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 30px;">Você ainda não salvou nenhum post.</p>`;
            return;
        }

        renderizarPostsNoElemento(posts, feedSalvos);
    } catch (err) {
        console.error(err);
    }
}

function renderizarPostsNoElemento(posts, elementoAlvo) {
    const salvosDoUsuario = (usuarioLogado && usuarioLogado.salvos) ? usuarioLogado.salvos : [];
    const seguindoDoUsuario = (usuarioLogado && usuarioLogado.seguindo) ? usuarioLogado.seguindo : [];

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
                        <button class="btn-dm" onclick="abrirDirectDoPost(${post.autorId}, '${post.autorNome}')" title="Enviar Mensagem">
                            ✉️ Chat
                        </button>
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
        elementoAlvo.appendChild(postElement);
    });
}

function abrirDirectDoPost(autorId, autorNome) {
    mudarAbaPrincipal('mensagens');
    abrirConversaDirect(autorId, autorNome);
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
            body: JSON.stringify({ 
                usuarioId: parseInt(usuarioLogado.id),
                usuarioNome: usuarioLogado.nome
            })
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
            body: JSON.stringify({ 
                usuarioId: parseInt(usuarioLogado.id),
                usuarioNome: usuarioLogado.nome
            })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            usuarioLogado.salvos = dados.salvos;
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
            botao.classList.toggle('saved', dados.salvou);
            botao.querySelector('span').innerText = dados.salvou ? 'Salvo' : 'Salvar';

            if (abaAtiva === 'salvos') carregarPostsSalvos();
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
            body: JSON.stringify({ 
                meuId: parseInt(usuarioLogado.id),
                meuNome: usuarioLogado.nome
            })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            usuarioLogado.seguindo = dados.seguindo;
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
            
            botao.classList.toggle('following', dados.seguindoAgora);
            botao.innerText = dados.seguindoAgora ? 'Seguindo' : '+ Seguir';
            
            document.getElementById('statSeguindo').innerText = dados.seguindo.length;
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
                autorId: parseInt(usuarioLogado.id),
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