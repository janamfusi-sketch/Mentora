let mm_nichos = ["Liderança", "Saúde Emocional", "Empreendedorismo", "Finanças", "Desenvolvimento Pessoal"];
let mm_materiais = [];

// Fase 7.3: os nichos vêm só do banco (antes uma cópia no navegador podia mostrar os nichos de outra conta)
try { localStorage.removeItem('mm_nichos_v2'); } catch (e) {}

async function mm_carregarNichosDoSupabase() {
 if (!window.supabaseClient || !window.mentorId) return;
 try {
 const { data, error } = await window.supabaseClient.from('Usuarios').select('nichos_metodologia').eq('id', window.mentorId).single();
 if (error) throw error;
 if (data && Array.isArray(data.nichos_metodologia) && data.nichos_metodologia.length > 0) {
 mm_nichos = data.nichos_metodologia;
 if (typeof mm_atualizarFiltros === 'function') mm_atualizarFiltros();
 }
 } catch (e) {
 console.error('Erro ao carregar nichos do Supabase:', e);
 }
}

async function mm_carregarDoSupabase() {
 if (!window.supabaseClient) {
 console.warn("Supabase client não está inicializado ainda.");
 return;
 }
 
 const { data, error } = await window.supabaseClient
 .from('Metodologias_Mentor')
 .select('*')
 .eq('mentor_id', String(window.mentorId || ''))
 .order('created_at', { ascending: false });
 
 if (!error && data) {
 mm_materiais = data.map(m => ({
 id: m.id,
 titulo: m.titulo,
 nicho: m.nicho,
 tipo: m.tipo,
 conteudo: m.conteudo,
 arquivos: m.arquivos_links || [],
 data: new Date(m.created_at).toLocaleDateString('pt-BR')
 }));
 
 // Atualizar tela se já estiver visível
 const grid = document.getElementById('mm-grid-cards');
 if(grid) mm_renderizarCards();
 } else if (error) {
 console.error("Erro ao puxar dados do Supabase:", error);
 }
}

// Carregar ao iniciar
window.addEventListener('DOMContentLoaded', () => {
 setTimeout(() => { mm_carregarDoSupabase(); mm_carregarNichosDoSupabase(); }, 1000); // Dá um tempo pro script do Supabase carregar
});

function abrirMinhaMetodologia() {
 document.getElementById('area-vip').style.display = 'none';
 const euMentorModal = document.getElementById('eu-mentor-modal');
 if(euMentorModal) euMentorModal.style.display = 'none';
 const frameworksModal = document.getElementById('frameworks-dashboard');
 if(frameworksModal) frameworksModal.style.display = 'none';
 const metoMentora = document.getElementById('area-metodologia-mentora');
 if(metoMentora) metoMentora.style.display = 'none';
 const euMentorDash = document.getElementById('eu-mentor-dashboard');
 if(euMentorDash) euMentorDash.style.display = 'none';
 const configArea = document.getElementById('area-configuracoes');
 if(configArea) configArea.style.display = 'none';
 const ferArea = document.getElementById('area-ferramentas');
 if(ferArea) ferArea.style.display = 'none';

 mm_carregarDoSupabase(); // Recarrega sempre que abrir a aba
 mm_atualizarFiltros();
 mm_renderizarCards();

 document.getElementById('area-minha-metodologia').style.display = 'block';
}

function mm_atualizarFiltros() {
 const select = document.getElementById('mm-filtro-nicho');
 if(!select) return;
 const atual = select.value;
 let options = '<option value="Todos">Todos os Nichos</option>';
 options += mm_nichos.map(n => `<option value="${mm_esc(n)}">${mm_esc(n)}</option>`).join('');
 select.innerHTML = options;
 if(atual && atual !== 'Todos' && mm_nichos.includes(atual)) select.value = atual;
}

function mm_renderizarCards() {
 const filtro = document.getElementById('mm-filtro-nicho').value;
 const grid = document.getElementById('mm-grid-cards');
 if(!grid) return;
 
 let filtrados = mm_materiais;
 if(filtro !== 'Todos') {
 filtrados = mm_materiais.filter(m => m.nicho === filtro);
 }
 
 if (filtrados.length === 0) {
 grid.innerHTML = `
 <div style="grid-column: 1 / -1; text-align:center; padding:4rem 2rem; background:#fff; border-radius:12px; border:1px dashed #cbd5e1; color:#94a3b8;"><div style="font-size:32px; margin-bottom:1rem;"></div>
 <div style="font-size:16px; font-weight:500;">Nenhum material encontrado.</div>
 <p style="font-size:14px; margin-top:0.5rem;">Crie seu primeiro material clicando em "+ Adicionar Material".</p>
 </div>`;
 return;
 }
 
 // Agrupar materiais por nicho
 const porNicho = {};
 filtrados.forEach(m => {
 if(!porNicho[m.nicho]) porNicho[m.nicho] = [];
 porNicho[m.nicho].push(m);
 });
 
 let html = '';
 Object.keys(porNicho).forEach(nicho => {
 let emoji = '';
 const nl = nicho.toLowerCase();
 if(nl.includes('lideran') || nl.includes('executiv')) emoji = '';
 else if(nl.includes('venda') || nl.includes('negócio') || nl.includes('empreend')) emoji = '';
 else if(nl.includes('vida') || nl.includes('humano') || nl.includes('pessoal') || nl.includes('emocional')) emoji = '';
 else if(nl.includes('finan')) emoji = '';

 html += `
 <div class="card" style="margin-bottom:0; display:flex; flex-direction:column; background:var(--pure-white); border-radius:12px; border:1px solid var(--border); padding:1.5rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);"><div style="font-size:24px; margin-bottom:8px;">${emoji}</div>
 <div class="card-title" style="font-weight:700; font-size:18px; color:var(--white); margin-bottom:8px;">${mm_esc(nicho)}</div>
 <p style="color:var(--text-muted); font-size:13px; margin-bottom:1.5rem;">Materiais e metodologias para a área de ${mm_esc(nicho)}.</p>
 <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:1rem; flex:1;">`;
 
 porNicho[nicho].forEach(m => {
 const icon = m.tipo === 'texto' ? '' : '';
 const desc = m.tipo === 'texto' ? 'Texto' : `${m.arquivos.length} arquivo(s)`;
 html += `
 <div onclick="mm_abrirMaterial('${mm_idSeguro(m.id)}')" style="background:#F8FAFC; border:1px solid rgba(0,0,0,0.05); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--purple)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(91,45,163,0.1)';" onmouseout="this.style.borderColor='rgba(0,0,0,0.05)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"><div style="display:flex; align-items:center; gap:12px;"><div style="font-size:20px;">${icon}</div>
 <div><div style="font-weight:600; font-size:14px; color:var(--text);">${mm_esc(m.titulo)}</div>
 <div style="font-size:11px; color:var(--text-muted);">${mm_esc(desc)} &bull; ${mm_esc(m.data)}</div>
 </div>
 </div>
 <div style="color:var(--purple); font-size:11px; font-weight:600; background:rgba(91,45,163,0.1); padding:4px 8px; border-radius:4px;">Abrir &rarr;</div>
 </div>
 `;
 });
 
 html += `
 </div>
 </div>
 `;
 });
 
 grid.innerHTML = html;
}

// ─── MODAL ADD/EDIT MATERIAL ───

let mm_materialAtualId = null;

function mm_abrirModalAdicionar() {
 mm_materialAtualId = null;
 document.getElementById('mm-modal-titulo').textContent = 'Novo Material';
 document.getElementById('mm-input-titulo').value = '';
 document.getElementById('mm-editor-texto').innerHTML = '';
 document.getElementById('mm-lista-arquivos').innerHTML = '';
 
 const selectNicho = document.getElementById('mm-input-nicho');
 let options = mm_nichos.map(n => `<option value="${mm_esc(n)}">${mm_esc(n)}</option>`).join('');
 options += `<option value="novo">+ Criar Novo Nicho...</option>`;
 selectNicho.innerHTML = options;
 
 mm_toggleTipoMaterial('texto');
 document.getElementById('mm-input-tipo').value = 'texto';
 
 document.getElementById('mm-novo-nicho-container').style.display = 'none';
 document.getElementById('mm-input-novo-nicho').value = '';
 
 document.getElementById('mm-modal-material').style.display = 'flex';
}

function mm_fecharModal() {
 document.getElementById('mm-modal-material').style.display = 'none';
 document.getElementById('mm-modal-visualizar').style.display = 'none';
}

function mm_toggleTipoMaterial(tipo) {
 if(tipo === 'texto') {
 document.getElementById('mm-area-texto').style.display = 'block';
 document.getElementById('mm-area-upload').style.display = 'none';
 } else {
 document.getElementById('mm-area-texto').style.display = 'none';
 document.getElementById('mm-area-upload').style.display = 'block';
 }
}

function mm_checarNovoNicho() {
 const select = document.getElementById('mm-input-nicho');
 const cont = document.getElementById('mm-novo-nicho-container');
 if(select.value === 'novo') {
 cont.style.display = 'flex';
 } else {
 cont.style.display = 'none';
 }
}

async function mm_salvarMaterial() {
 if(!window.supabaseClient) return alert("Erro: Supabase não está carregado. Recarregue a página.");

 const titulo = document.getElementById('mm-input-titulo').value.trim();
 let nicho = document.getElementById('mm-input-nicho').value;
 const tipo = document.getElementById('mm-input-tipo').value;
 
 if(!titulo) return alert("Digite um título.");
 
 if(nicho === 'novo') {
 nicho = document.getElementById('mm-input-novo-nicho').value.trim();
 if(!nicho) return alert("Digite o nome do novo nicho.");
 if(!mm_nichos.includes(nicho)) {
 mm_nichos.push(nicho);
 mm_atualizarFiltros();
 if (window.supabaseClient && window.mentorId) {
 window.supabaseClient.from('Usuarios').update({ nichos_metodologia: mm_nichos }).eq('id', window.mentorId).then(({ error }) => {
 if (error) {
 console.error('Erro ao salvar nicho no Supabase:', error);
 alert('Não foi possível salvar o nicho novo agora. Verifique a internet e tente de novo.');
 mm_nichos = mm_nichos.filter(n => n !== nicho);
 mm_atualizarFiltros();
 }
 });
 }
 }
 }
 
 const conteudo = mm_htmlSeguro(document.getElementById('mm-editor-texto').innerHTML);
 const fileInput = document.getElementById('mm-file-input');
 
 document.getElementById('mm-modal-titulo').textContent = 'Salvando no Supabase... aguarde.';
 
 let arquivos_links = [];
 if(tipo === 'arquivo' && fileInput.files.length> 0) {
 for(let i=0; i<fileInput.files.length; i++) {
 const file = fileInput.files[i];
 const filePath = `${window.mentorId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
 
 const { error: uploadError } = await window.supabaseClient.storage
 .from('materiais_metodologia')
 .upload(filePath, file);
 
 if (uploadError) {
 alert("Erro no upload do arquivo para o Supabase: " + uploadError.message);
 document.getElementById('mm-modal-titulo').textContent = mm_materialAtualId ? 'Editar Material' : 'Novo Material';
 return;
 }
 
 const { data: publicUrlData } = window.supabaseClient.storage
 .from('materiais_metodologia')
 .getPublicUrl(filePath);
 
 arquivos_links.push({
 nome: file.name,
 tamanho: (file.size / 1024 / 1024).toFixed(2) + ' MB',
 file_url: publicUrlData.publicUrl
 });
 }
 } else if (tipo === 'arquivo' && mm_materialAtualId) {
 // Manter arquivos antigos se for edição e nenhum arquivo novo for selecionado
 const matAntigo = mm_materiais.find(m =>m.id === mm_materialAtualId);
 if(matAntigo && matAntigo.arquivos) {
 arquivos_links = matAntigo.arquivos;
 }
 }

 const payload = {
 mentor_id: window.mentorId, // cada material pertence a quem criou
 titulo: titulo,
 nicho: nicho,
 tipo: tipo,
 conteudo: conteudo,
 arquivos_links: arquivos_links
 };
 
 if (mm_materialAtualId) {
 // Update
 const { error: updateError } = await window.supabaseClient
 .from('Metodologias_Mentor')
 .update(payload)
 .eq('id', mm_materialAtualId);
 
 if (updateError) {
 alert("Erro ao atualizar no banco de dados.");
 document.getElementById('mm-modal-titulo').textContent = 'Editar Material';
 return;
 }
 } else {
 // Insert
 const { error: insertError } = await window.supabaseClient
 .from('Metodologias_Mentor')
 .insert([payload]);
 
 if (insertError) {
 alert("Erro ao inserir no banco de dados.");
 document.getElementById('mm-modal-titulo').textContent = 'Novo Material';
 return;
 }
 }
 
 await mm_carregarDoSupabase();
 mm_fecharModal();
 alert("Material salvo com sucesso!");
}

// ─── VISUALIZAR MATERIAL ───

let mm_visualizando = null;

function mm_abrirMaterial(id) {
 const m = mm_materiais.find(x => x.id === id);
 if(!m) return;
 mm_visualizando = m;
 
 document.getElementById('mm-vis-titulo').textContent = m.titulo;
 document.getElementById('mm-vis-nicho').textContent = m.nicho;
 
 const contentArea = document.getElementById('mm-vis-conteudo');
 const exportButtons = document.getElementById('mm-vis-export-buttons');
 
 if(m.tipo === 'texto') {
 contentArea.innerHTML = `<div style="line-height:1.6; color:#334155;">${m.conteudo ? mm_htmlSeguro(m.conteudo) : '<i>Sem conteúdo.</i>'}</div>`;
 document.getElementById('mm-vis-btn-edit').style.display = 'inline-block';
 if(exportButtons) exportButtons.style.display = 'flex';
 } else {
 // Premium file viewer - Design Limpo e Direto
 let html = '';
 
 // Se houver mais de um arquivo, mostra abinhas elegantes
 if (m.arquivos && m.arquivos.length> 1) {
 html += `<div style="display:flex; gap:8px; margin-bottom:1rem; overflow-x:auto; padding-bottom:4px;">`;
 m.arquivos.forEach((arq, idx) => {
 html += `<button onclick="mm_renderizarDocumentoPremium(${idx})" style="background:#f1f5f9; border:1px solid #e2e8f0; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:600; color:#475569; cursor:pointer; white-space:nowrap; transition:0.2s; font-family:'Inter',sans-serif;" onmouseover="this.style.background='#e0e7ff'; this.style.color='#4338ca'; this.style.borderColor='#4338ca';" onmouseout="this.style.background='#f1f5f9'; this.style.color='#475569'; this.style.borderColor='#e2e8f0';">${mm_esc(arq.nome)}</button>`;
 });
 html += `</div>`;
 }
 
 // Container do documento (estilo folha sulfite/tela limpa)
 html += `<div id="mm-file-viewer-container" style="width:100%; min-height:500px; max-height: 65vh; overflow-y:auto; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">`;
 
 if (m.arquivos && m.arquivos.length> 0) {
 html += `<div style="color:#94a3b8; font-size:14px; font-weight:500; font-family:'Inter',sans-serif; display:flex; flex-direction:column; align-items:center; gap:12px;"><div style="font-size:32px;"></div> Carregando documento oficial...</div>`;
 } else {
 html += `<i style="color:#94a3b8;">Nenhum arquivo anexado.</i>`;
 }
 html += `</div>`;
 
 contentArea.innerHTML = html;
 document.getElementById('mm-vis-btn-edit').style.display = 'none'; // Para arquivos, edição é re-upload (pode ser feito apagando o card)
 if(exportButtons) exportButtons.style.display = 'none'; // Esconde os botões DOC/PDF pois já é arquivo
 
 // Auto-renderiza o primeiro arquivo imediatamente
 if (m.arquivos && m.arquivos.length> 0) {
 setTimeout(() => {
 mm_renderizarDocumentoPremium(0);
 }, 50);
 }
 }
 
 document.getElementById('mm-modal-visualizar').style.display = 'flex';
}

window.mm_renderizarDocumentoPremium = async function(idx) {
 if(!mm_visualizando || !mm_visualizando.arquivos || !mm_visualizando.arquivos[idx]) return;
 const arquivo = mm_visualizando.arquivos[idx];
 const viewer = document.getElementById('mm-file-viewer-container');
 if(!viewer) return;
 
 if(!arquivo.file_url) {
 viewer.innerHTML = `<div style="padding:2rem; text-align:center; color:#ef4444; font-family:'Inter',sans-serif;">Erro: Arquivo corrompido ou sem URL.</div>`;
 return;
 }
 
 viewer.innerHTML = `<div style="color:#94a3b8; font-size:14px; font-weight:500; font-family:'Inter',sans-serif; display:flex; flex-direction:column; align-items:center; gap:12px; padding:3rem;"><div style="font-size:32px;"></div> Processando leitura...</div>`;
 
 const nomeLower = arquivo.nome.toLowerCase();
 const url = window.mentoraLinkArquivo ? await window.mentoraLinkArquivo(arquivo.file_url) : arquivo.file_url;
 
 if(nomeLower.endsWith('.pdf')) {
 // Render PDF no Iframe preenchendo o container
 viewer.style.background = '#e2e8f0'; // Fundo mais escuro para contrastar o pdf
 viewer.style.padding = '0';
 viewer.innerHTML = `<iframe src="${/^https:\/\//.test(url) ? String(url).replace(/"/g, '%22') : 'about:blank'}#toolbar=0&navpanes=0&scrollbar=0" width="100%" height="600px" style="border:none; border-radius:12px; display:block;"></iframe>`;
 } 
 else if (nomeLower.endsWith('.docx') || nomeLower.endsWith('.doc')) {
 // Render DOCX com Mammoth
 try {
 const response = await fetch(url);
 const arrayBuffer = await response.arrayBuffer();
 
 if (typeof mammoth !== 'undefined') {
 const result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
 viewer.style.background = '#ffffff';
 viewer.style.alignItems = 'flex-start';
 viewer.style.justifyContent = 'flex-start';
 viewer.innerHTML = `<div style="padding:3rem; width:100%; box-sizing:border-box; color:#334155; line-height:1.8; font-family:'Inter', sans-serif;"><div style="margin-bottom:2rem; padding-bottom:1rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;"><div style="font-size:11px; color:#94a3b8; font-weight:700; letter-spacing:1px; text-transform:uppercase;">Visualização Direta do Material</div>
 <div style="font-size:11px; color:#4338ca; font-weight:700; background:#e0e7ff; padding:4px 10px; border-radius:6px; letter-spacing:0.5px;">DOCX FORMAT</div>
 </div>
 <div class="word-content-premium">${result.value ? mm_htmlSeguro(result.value) : '<i style="color:#94a3b8;">Documento em branco.</i>'}
 </div>
 </div>`;
 
 // Adiciona estilos para deixar o Word bonito na tela
 const style = document.createElement('style');
 style.innerHTML = `
 .word-content-premium h1 { font-size:28px; color:#1e293b; margin-bottom:1.2rem; font-family:'Playfair Display', serif; line-height:1.2; }
 .word-content-premium h2 { font-size:22px; color:#1e293b; margin-top:2rem; margin-bottom:1rem; font-family:'Playfair Display', serif; }
 .word-content-premium h3 { font-size:18px; color:#334155; margin-top:1.5rem; margin-bottom:0.75rem; font-weight:600; }
 .word-content-premium p { margin-bottom:1.2rem; font-size:15px; color:#475569; }
 .word-content-premium ul { margin-bottom:1.2rem; padding-left:1.5rem; }
 .word-content-premium li { margin-bottom:0.5rem; font-size:15px; color:#475569; }
 .word-content-premium table { border-collapse: collapse; width: 100%; margin-bottom:1.5rem; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
 .word-content-premium td, .word-content-premium th { border: 1px solid #e2e8f0; padding: 12px; text-align:left; font-size:14px; }
 .word-content-premium th { background-color: #f8fafc; font-weight:600; color:#1e293b; }
 `;
 viewer.appendChild(style);
 } else {
 viewer.innerHTML = `<div style="padding:3rem; text-align:center; color:#64748b; font-family:'Inter',sans-serif;">A biblioteca de leitura de arquivos Word não foi carregada no sistema.</div>`;
 }
 } catch (e) {
 console.error("Erro ao converter DOCX:", e);
 viewer.innerHTML = `<div style="padding:3rem; text-align:center; color:#ef4444; font-family:'Inter',sans-serif;">Erro interno ao processar e ler o arquivo Word.</div>`;
 }
 }
 else {
 viewer.innerHTML = `<div style="padding:3rem; text-align:center; color:#64748b; font-family:'Inter',sans-serif;"><div style="font-size:40px; margin-bottom:12px;"></div>
 O formato de arquivo <b>${mm_esc(arquivo.nome)}</b> não suporta visualização em tela.
 <br><br><a href="${/^https:\/\//.test(String(url)) ? mm_esc(url) : '#'}" target="_blank" rel="noopener noreferrer" style="background:#4338ca; color:#fff; text-decoration:none; padding:10px 20px; border-radius:8px; font-weight:600; display:inline-block; font-size:14px;">Baixar Arquivo Original</a>
 </div>`;
 }
}


function mm_editarMaterialAberto() {
 if(!mm_visualizando) return;
 mm_fecharModal();
 
 mm_materialAtualId = mm_visualizando.id;
 
 document.getElementById('mm-modal-titulo').textContent = 'Editar Material';
 document.getElementById('mm-input-titulo').value = mm_visualizando.titulo;
 
 const selectNicho = document.getElementById('mm-input-nicho');
 let options = mm_nichos.map(n => `<option value="${mm_esc(n)}">${mm_esc(n)}</option>`).join('');
 options += `<option value="novo">+ Criar Novo Nicho...</option>`;
 selectNicho.innerHTML = options;
 selectNicho.value = mm_visualizando.nicho;
 mm_checarNovoNicho();
 
 document.getElementById('mm-input-tipo').value = mm_visualizando.tipo;
 mm_toggleTipoMaterial(mm_visualizando.tipo);
 
 if(mm_visualizando.tipo === 'texto') {
 document.getElementById('mm-editor-texto').innerHTML = mm_htmlSeguro(mm_visualizando.conteudo);
 }
 
 document.getElementById('mm-modal-material').style.display = 'flex';
}

async function mm_excluirMaterialAberto() {
 if(!mm_visualizando) return;
 if(confirm("Tem certeza que deseja excluir definitivamente este material do Supabase?")) {
 document.getElementById('mm-vis-titulo').textContent = 'Excluindo...';
 
 // 1. Apagar os arquivos do Storage
 if (mm_visualizando.arquivos && mm_visualizando.arquivos.length> 0) {
 for(const arq of mm_visualizando.arquivos) {
 if (arq.file_url) {
 try {
 const baseUrl = window.supabaseClient.supabaseUrl + '/storage/v1/object/public/materiais_metodologia/';
 if (arq.file_url.startsWith(baseUrl)) {
 const path = arq.file_url.replace(baseUrl, '');
 await window.supabaseClient.storage.from('materiais_metodologia').remove([path]);
 }
 } catch(e) { console.error("Erro deletando storage:", e); }
 }
 }
 }
 
 // 2. Apagar da Tabela
 await window.supabaseClient.from('Metodologias_Mentor').delete().eq('id', mm_visualizando.id);
 
 await mm_carregarDoSupabase();
 mm_fecharModal();
 }
}

// ─── EXPORTAÇÃO SEGURA (DOC e PDF) ───

function mm_exportarVisDOC() {
 if(!mm_visualizando || mm_visualizando.tipo !== 'texto') {
 return alert("Apenas materiais de texto podem ser exportados para Word neste momento.");
 }
 
 const content = document.getElementById('mm-vis-conteudo').innerHTML;
 
 // Uma estrutura HTML limpa e reconhecida pelo Word
 const html = `
 <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${mm_esc(mm_visualizando.titulo)}</title>
 <style>body { font-family: Arial, sans-serif; font-size: 12pt; }
 h1 { font-size: 24pt; color: #333; }
 h3 { font-size: 14pt; color: #666; }
 </style>
 </head>
 <body><h1>${mm_esc(mm_visualizando.titulo)}</h1>
 <h3>Nicho: ${mm_esc(mm_visualizando.nicho)}</h3>
 <hr><br>${mm_htmlSeguro(content)}
 </body>
 </html>
 `;
 
 const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `Metodologia_${mm_visualizando.titulo.replace(/\\s+/g, '_')}.doc`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
}

function mm_exportarVisPDF() {
 // Ocultar botões do modal para impressão limpa, ou abrir nova janela
 if(!mm_visualizando) return;
 
 const printWindow = window.open('', '_blank');
 printWindow.document.write(`
 <html><head><title>Imprimir PDF - ${mm_esc(mm_visualizando.titulo)}</title>
 <style>body { font-family: 'Inter', sans-serif; color: #334155; padding: 40px; }
 h1 { color: #1e293b; margin-bottom: 5px; }
 .nicho { display:inline-block; font-size: 12px; font-weight: bold; background: #e0e7ff; color: #4338ca; padding: 4px 8px; border-radius: 4px; margin-bottom: 20px; text-transform: uppercase; }
 .content { line-height: 1.6; }
 </style>
 </head>
 <body><h1>${mm_esc(mm_visualizando.titulo)}</h1>
 <div class="nicho">${mm_esc(mm_visualizando.nicho)}</div>
 <div class="content">${mm_visualizando.tipo === 'texto' ? mm_htmlSeguro(mm_visualizando.conteudo) : '<i>Material em anexo (Ver plataforma)</i>'}
 </div>
 <script>window.onload = function() { window.print(); window.close(); }
 </script>
 </body>
 </html>
 `);
 printWindow.document.close();
}

// ── Filtro de segurança do conteúdo das metodologias ──
// Mantém a formatação (títulos, listas, negrito, links, tabelas) e remove qualquer código:
// scripts, eventos (onclick...), iframes, formulários e links "javascript:".
function mm_htmlSeguro(html) {
  const PERMITIDAS = ['P','BR','B','STRONG','I','EM','U','S','UL','OL','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','SPAN','DIV','A','TABLE','THEAD','TBODY','TR','TH','TD','HR','CODE','PRE','SMALL','SUP','SUB','MARK'];
  const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
  const raiz = doc.body.firstChild;
  (function limpar(no) {
    Array.from(no.childNodes).forEach(filho => {
      if (filho.nodeType === 3) return;                           // texto
      if (filho.nodeType !== 1) { filho.remove(); return; }       // comentários etc.
      if (!PERMITIDAS.includes(filho.tagName)) {
        if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','SVG','MATH','LINK','META'].includes(filho.tagName)) { filho.remove(); return; }
        const texto = doc.createTextNode(filho.textContent || ''); filho.replaceWith(texto); return;
      }
      Array.from(filho.attributes).forEach(at => {
        const nome = at.name.toLowerCase();
        const manter = (filho.tagName === 'A' && nome === 'href' && /^(https?:|mailto:)/i.test(at.value.trim())) || ((filho.tagName === 'TD' || filho.tagName === 'TH') && (nome === 'colspan' || nome === 'rowspan'));
        if (!manter) filho.removeAttribute(at.name);
      });
      if (filho.tagName === 'A' && filho.getAttribute('href')) { filho.setAttribute('target', '_blank'); filho.setAttribute('rel', 'noopener noreferrer'); }
      limpar(filho);
    });
  })(raiz);
  return raiz.innerHTML;
}
window.mm_htmlSeguro = mm_htmlSeguro;

// Texto simples dentro do HTML (títulos, nichos, nomes de arquivo): nunca vira código
function mm_esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Identificador usado dentro de onclick: só letras, números, hífen e sublinhado
function mm_idSeguro(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, ''); }

// ── Arquivos escolhidos para enviar (mostra a lista e avisa o que não será aceito) ──
window.mm_mostrarSelecionados = function (input) {
  let caixa = document.getElementById('mm-selecionados');
  if (!caixa) { caixa = document.createElement('div'); caixa.id = 'mm-selecionados'; caixa.style.cssText = 'margin-top:10px; text-align:left; font-size:13px; color:#334155;'; input.parentElement.appendChild(caixa); }
  const aceitos = /\.(pdf|docx?|pptx?|xlsx?|txt|png|jpe?g|webp|gif|mp4|webm)$/i;
  const itens = Array.from(input.files || []).map(f => {
    const mb = (f.size / 1048576).toFixed(1).replace('.', ',');
    const problema = !aceitos.test(f.name) ? ' — tipo de arquivo não aceito' : (f.size > 50 * 1048576 ? ' — passa de 50 MB' : '');
    return `<div style="padding:4px 0; color:${problema ? '#B91C1C' : '#334155'};">${f.name.replace(/[<>&"]/g, '')} (${mb} MB)${problema}</div>`;
  });
  caixa.innerHTML = itens.length ? `<div style="font-weight:600; margin-bottom:4px;">${itens.length} arquivo(s) escolhido(s) — serão enviados ao salvar:</div>${itens.join('')}` : '';
};
