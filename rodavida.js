// rodavida.js - Roda da Vida e Mapa de Impacto Integrados (Vibrante, Completo e Sem Cortes)

const RV_DOMINIOS = [
 // PESSOAL (Top-Right: 12h - 3h)
 { id: 'saude', name: 'Saúde e disposição', lines: ['Saúde e', 'disposição'], quad: 'Pessoal', color: '#FF3B30', darkColor: '#D70015' },
 { id: 'intelect', name: 'Desenvolvimento intelectual', lines: ['Desenvolvimento', 'intelectual'], quad: 'Pessoal', color: '#FF2D55', darkColor: '#D61B48' },
 { id: 'emocional', name: 'Equilíbrio emocional', lines: ['Equilíbrio', 'emocional'], quad: 'Pessoal', color: '#AF52DE', darkColor: '#8924B7' },

 // PROFISSIONAL (Bottom-Right: 3h - 6h)
 { id: 'proposito', name: 'Realização e propósito', lines: ['Realização &', 'propósito'], quad: 'Profissional', color: '#5856D6', darkColor: '#3634A3' },
 { id: 'financeiro', name: 'Recursos financeiros', lines: ['Recursos', 'financeiros'], quad: 'Profissional', color: '#007AFF', darkColor: '#0051A8' },
 { id: 'social_contrib', name: 'Contribuição social', lines: ['Contribuição', 'social'], quad: 'Profissional', color: '#00C7BE', darkColor: '#008E87' },

 // RELACIONAMENTOS (Bottom-Left: 6h - 9h)
 { id: 'familia', name: 'Família', lines: ['Família', ''], quad: 'Relacionamentos', color: '#34C759', darkColor: '#248A3D' },
 { id: 'amoroso', name: 'Desenvolvimento amoroso', lines: ['Desenvolv.', 'amoroso'], quad: 'Relacionamentos', color: '#30B0C7', darkColor: '#1F7E91' },
 { id: 'social_vida', name: 'Vida social', lines: ['Vida social', ''], quad: 'Relacionamentos', color: '#32ADE6', darkColor: '#0071A4' },

 // QUALIDADE DE VIDA (Top-Left: 9h - 12h)
 { id: 'hobbies', name: 'Criatividade, hobbies e diversão', lines: ['Criatividade &', 'hobbies'], quad: 'Qualidade de vida', color: '#FFCC00', darkColor: '#A38000' },
 { id: 'plenitude', name: 'Plenitude e felicidade', lines: ['Plenitude e', 'felicidade'], quad: 'Qualidade de vida', color: '#FF9500', darkColor: '#C26B00' },
 { id: 'espiritual', name: 'Espiritualidade', lines: ['Espiritualidade', ''], quad: 'Qualidade de vida', color: '#FF6B00', darkColor: '#C74B00' }
];

let rv_scores = [7, 8, 6, 7, 5, 6, 8, 7, 6, 6, 7, 8];
let rv_observations = Array(12).fill('');
let rv_initialized = false;

// ── NAVEGAÇÃO DE SUB-ABAS DE FERRAMENTAS ──
window.cp_switchSubtabFerramentas = function(subtab) {
 const btnPdf = document.getElementById('subtab-ferramentas-pdf');
 const btnRoda = document.getElementById('subtab-ferramentas-rodavida');
 const contentPdf = document.getElementById('subtab-content-ferramentas-pdf');
 const contentRoda = document.getElementById('subtab-content-ferramentas-rodavida');
 const contentSmart = document.getElementById('subtab-content-ferramentas-smart');
 const contentSwot = document.getElementById('subtab-content-ferramentas-swot');

 if (btnPdf) btnPdf.classList.toggle('active', subtab === 'pdf');
 if (btnRoda) btnRoda.classList.toggle('active', subtab === 'rodavida');

 if (contentPdf) contentPdf.style.display = subtab === 'pdf' ? 'block' : 'none';
 if (contentRoda) contentRoda.style.display = subtab === 'rodavida' ? 'block' : 'none';
 if (contentSmart) contentSmart.style.display = subtab === 'smart' ? 'block' : 'none';
 if (contentSwot) contentSwot.style.display = subtab === 'swot' ? 'block' : 'none';

 if (subtab === 'rodavida') {
 rv_init();
 }
};

// ── INICIALIZAÇÃO ──
function rv_init() {
 if (!rv_initialized) {
 rv_renderQuadrantsUI();
 rv_initialized = true;
 }
 rv_populateMenteeSelect();
 rv_updateAll();
}

function rv_populateMenteeSelect() {
 const sel = document.getElementById('rv-mentorado-select');
 if (!sel) return;

 const mentees = (typeof cp_mentees !== 'undefined' && Array.isArray(cp_mentees)) ? cp_mentees : [];
 const currentId = (typeof cp_currentMentee !== 'undefined' && cp_currentMentee) ? cp_currentMentee.id : '';

 let html = '<option value="">Selecione o Mentorado...</option>';
 mentees.forEach(m => {
 const isSelected = String(m.id) === String(currentId) ? 'selected' : '';
 html += `<option value="${m.id}" ${isSelected}>${m.nome || 'Mentorado'}</option>`;
 });

 sel.innerHTML = html;
}

window.rv_onMenteeSelectChange = function(sel) {
 const val = sel.value;
 if (!val) {
 if (typeof cp_currentMentee !== 'undefined') cp_currentMentee = null;
 return;
 }
 if (typeof cp_mentees !== 'undefined') {
 const found = cp_mentees.find(m => String(m.id) === String(val));
 if (found) {
 cp_currentMentee = found;
 }
 }
};

// ── RENDERIZAÇÃO DOS CAMPOS DE ENTRADA NA ESQUERDA ──
function rv_renderQuadrantsUI() {
 const container = document.getElementById('rv-quadrants-container');
 if (!container) return;

 const quads = [
 { title: 'Pessoal', color: '#FF2D55', bg: 'rgba(255, 45, 85, 0.05)', border: 'rgba(255, 45, 85, 0.2)' },
 { title: 'Profissional', color: '#007AFF', bg: 'rgba(0, 122, 255, 0.05)', border: 'rgba(0, 122, 255, 0.2)' },
 { title: 'Relacionamentos', color: '#34C759', bg: 'rgba(52, 199, 89, 0.05)', border: 'rgba(52, 199, 89, 0.2)' },
 { title: 'Qualidade de vida', color: '#FF9500', bg: 'rgba(255, 149, 0, 0.05)', border: 'rgba(255, 149, 0, 0.2)' }
 ];

 let html = '';
 quads.forEach(q => {
 const dominiosDoQuad = RV_DOMINIOS.filter(d => d.quad === q.title);

 html += `
 <div class="card" style="background:#fff; border-radius:16px; border:1px solid ${q.border}; padding:20px; margin-bottom:0; box-shadow:0 4px 15px rgba(0,0,0,0.02);"><div style="display:flex; align-items:center; gap:8px; margin-bottom:16px; padding-bottom:10px; border-bottom:2px solid ${q.border};"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${q.color};"></span>
 <h4 style="margin:0; font-size:16px; font-weight:700; color:var(--text); font-family:'Playfair Display',serif;">${q.title}</h4>
 </div>
 
 <div style="display:flex; flex-direction:column; gap:16px;">`;

 dominiosDoQuad.forEach(d => {
 const idx = RV_DOMINIOS.findIndex(x => x.id === d.id);
 const scoreVal = rv_scores[idx];

 let pills = '';
 for (let n = 1; n <= 10; n++) {
 pills += `<button type="button" onclick="rv_setScore(${idx}, ${n})" style="flex:1; padding:5px 0; font-size:11px; font-weight:700; border-radius:6px; border:1px solid ${n === scoreVal ? d.color : '#e2e8f0'}; background:${n === scoreVal ? d.color : '#f8fafc'}; color:${n === scoreVal ? '#fff' : '#64748b'}; cursor:pointer; transition:0.15s;">${n}</button>`;
 }

 html += `
 <div style="background:${q.bg}; padding:14px; border-radius:12px; border:1px solid rgba(0,0,0,0.04);"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><label style="font-weight:700; font-size:13px; color:var(--text);">${d.name}
 </label>
 <span id="rv-badge-${idx}" style="background:${d.color}; color:#fff; font-size:12px; font-weight:800; padding:2px 10px; border-radius:12px;">${scoreVal} / 10
 </span>
 </div>

 <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><input type="range" id="rv-slider-${idx}" min="1" max="10" value="${scoreVal}" oninput="rv_setScore(${idx}, parseInt(this.value))" style="flex:1; accent-color:${d.color}; cursor:pointer;"></div>

 <div style="display:flex; gap:3px; margin-bottom:10px;" id="rv-pills-${idx}">${pills}
 </div>

 <div><textarea id="rv-obs-${idx}" class="rv-obs-input" oninput="rv_setObs(${idx}, this.value)" placeholder="Observações do mentor para ${d.name}..." style="width:100%; min-height:55px; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-family:inherit; font-size:12px; outline:none; resize:vertical; background:#fff; line-height:1.4;">${rv_observations[idx] || ''}</textarea>
 </div>
 </div>
 `;
 });

 html += `
 </div>
 </div>
 `;
 });

 container.innerHTML = html;
}

// ── ATUALIZAR SCORE DE UM DOMÍNIO ──
window.rv_setScore = function(index, value) {
 rv_scores[index] = Math.max(1, Math.min(10, value));
 
 const slider = document.getElementById(`rv-slider-${index}`);
 if (slider) slider.value = rv_scores[index];

 const badge = document.getElementById(`rv-badge-${index}`);
 if (badge) badge.textContent = `${rv_scores[index]} / 10`;

 const d = RV_DOMINIOS[index];
 const pillsContainer = document.getElementById(`rv-pills-${index}`);
 if (pillsContainer) {
 let pills = '';
 for (let n = 1; n <= 10; n++) {
 pills += `<button type="button" onclick="rv_setScore(${index}, ${n})" style="flex:1; padding:5px 0; font-size:11px; font-weight:700; border-radius:6px; border:1px solid ${n === rv_scores[index] ? d.color : '#e2e8f0'}; background:${n === rv_scores[index] ? d.color : '#f8fafc'}; color:${n === rv_scores[index] ? '#fff' : '#64748b'}; cursor:pointer; transition:0.15s;">${n}</button>`;
 }
 pillsContainer.innerHTML = pills;
 }

 rv_updateAll();
};

// ── ATUALIZAR OBSERVAÇÃO DE UM DOMÍNIO ──
window.rv_setObs = function(index, text) {
 rv_observations[index] = text;
};

// ── RECALCULAR GRÁFICO E MÉTRICAS ──
function rv_updateAll() {
 rv_renderSVGWheel();
 rv_renderSVGImpactMap();
 rv_renderCamposAtencao();
 rv_updateMetrics();
}

function svgSectorPath(cx, cy, rInner, rOuter, startDeg, endDeg) {
 const a0 = (startDeg * Math.PI) / 180;
 const a1 = (endDeg * Math.PI) / 180;
 const x1 = cx + rOuter * Math.cos(a0);
 const y1 = cy + rOuter * Math.sin(a0);
 const x2 = cx + rOuter * Math.cos(a1);
 const y2 = cy + rOuter * Math.sin(a1);
 const x3 = cx + rInner * Math.cos(a1);
 const y3 = cy + rInner * Math.sin(a1);
 const x4 = cx + rInner * Math.cos(a0);
 const y4 = cy + rInner * Math.sin(a0);
 const largeArc = (endDeg - startDeg)> 180 ? 1 : 0;
 return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

function svgArcPath(cx, cy, r, startDeg, endDeg, clockwise = true) {
 const a0 = ((clockwise ? startDeg : endDeg) * Math.PI) / 180;
 const a1 = ((clockwise ? endDeg : startDeg) * Math.PI) / 180;
 const x0 = cx + r * Math.cos(a0);
 const y0 = cy + r * Math.sin(a0);
 const x1 = cx + r * Math.cos(a1);
 const y1 = cy + r * Math.sin(a1);
 const sweep = clockwise ? 1 : 0;
 return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ── GERADOR VETORIAL SVG RODA DA VIDA (COLORIDA ORIGINAL, SEM O POLÍGONO AZUL) ──
function rv_renderSVGWheel() {
 const container = document.getElementById('rv-svg-wrapper');
 if (!container) return;

 const cx = 300;
 const cy = 300;
 const minR = 25;
 const maxR = 175;
 const headerR = maxR + 62; // 237px (Faixa bem ampla para os 12 domínios)
 const outerR = headerR + 45; // 282px (Faixa dos 4 quadrantes externos)
 const sectorAngle = 30; // 360 / 12 = 30 deg

 let defs = `<defs>`;
 let body = ``;

 // ── 1. ANÉIS EXTERNOS DOS 4 QUADRANTES ──
 const quads = [
 { title: 'PESSOAL', startDeg: -90, endDeg: 0, color: '#FF2D55', isBottom: false },
 { title: 'PROFISSIONAL', startDeg: 0, endDeg: 90, color: '#007AFF', isBottom: true },
 { title: 'RELACIONAMENTOS', startDeg: 90, endDeg: 180, color: '#34C759', isBottom: true },
 { title: 'QUALIDADE DE VIDA', startDeg: 180, endDeg: 270, color: '#FF9500', isBottom: false }
 ];

 const midQuadR = headerR + (outerR - headerR) / 2;

 quads.forEach((q, i) => {
 const pathD = svgSectorPath(cx, cy, headerR, outerR, q.startDeg, q.endDeg);
 body += `<path d="${pathD}" fill="${q.color}" stroke="#FFFFFF" stroke-width="2.5" />`;

 const qPathD = svgArcPath(cx, cy, midQuadR, q.startDeg + 3, q.endDeg - 3, !q.isBottom);
 defs += `<path id="rv-qpath-${i}" d="${qPathD}" />`;

 body += `<text><textPath href="#rv-qpath-${i}" xlink:href="#rv-qpath-${i}" startOffset="50%" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" font-size="13.5" font-weight="900" letter-spacing="1.5px">${q.title}</textPath></text>`;
 });

 // ── 2. CABEÇALHOS DOS 12 DOMÍNIOS ──
 RV_DOMINIOS.forEach((d, i) => {
 const startDeg = -90 + i * sectorAngle;
 const endDeg = startDeg + sectorAngle;
 const midDeg = startDeg + sectorAngle / 2;
 const midRad = (midDeg * Math.PI) / 180;

 const pathD = svgSectorPath(cx, cy, maxR, headerR, startDeg, endDeg);
 body += `<path d="${pathD}" fill="${d.darkColor}" stroke="#FFFFFF" stroke-width="1.5" />`;

 const textR = maxR + (headerR - maxR) * 0.5;
 const tx = cx + textR * Math.cos(midRad);
 const ty = cy + textR * Math.sin(midRad);

 const line1 = d.lines[0];
 const line2 = d.lines[1];

 const fontSize = (line1.length> 13 || (line2 && line2.length> 13)) ? '9.5' : '10.5';

 if (line2) {
 body += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#FFFFFF" font-size="${fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="central">`;
 body += `<tspan x="${tx.toFixed(1)}" dy="-6">${line1}</tspan>`;
 body += `<tspan x="${tx.toFixed(1)}" dy="12">${line2}</tspan>`;
 body += `</text>`;
 } else {
 body += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#FFFFFF" font-size="11.5" font-weight="800" text-anchor="middle" dominant-baseline="central">${line1}</text>`;
 }
 });

 // ── 3. PREENCHIMENTO DE COR DE CADA SETOR COM BADGE DE SCORE ──
 RV_DOMINIOS.forEach((d, i) => {
 const startDeg = -90 + i * sectorAngle;
 const endDeg = startDeg + sectorAngle;
 const score = rv_scores[i];
 const fillR = minR + (score / 10) * (maxR - minR);

 const pathD = svgSectorPath(cx, cy, minR, fillR, startDeg, endDeg);
 body += `<path d="${pathD}" fill="${d.color}" fill-opacity="0.55" stroke="${d.color}" stroke-width="1.5" />`;

 // Indicador circular da nota na borda do setor
 const midDeg = startDeg + sectorAngle / 2;
 const midRad = (midDeg * Math.PI) / 180;
 const px = cx + fillR * Math.cos(midRad);
 const py = cy + fillR * Math.sin(midRad);
 body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7.5" fill="${d.darkColor}" stroke="#FFFFFF" stroke-width="2" />`;
 body += `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" fill="#FFFFFF" font-size="9" font-weight="900" text-anchor="middle" dominant-baseline="central">${score}</text>`;
 });

 // ── 4. 10 ANÉIS CONCÊNTRICOS DE ESCALA 1 A 10 ──
 for (let lvl = 1; lvl <= 10; lvl++) {
 const r = minR + (lvl / 10) * (maxR - minR);
 body += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${lvl === 10 ? '#1E293B' : 'rgba(203, 213, 225, 0.8)'}" stroke-width="${lvl === 10 ? '2' : '1'}" />`;

 // Badge com fundo para legibilidade dos números de escala
 body += `<rect x="${(cx - 7.5).toFixed(1)}" y="${(cy - r - 6.5).toFixed(1)}" width="15" height="13" rx="3" fill="#FFFFFF" fill-opacity="0.9" />`;
 body += `<text x="${cx}" y="${(cy - r).toFixed(1)}" fill="#1E293B" font-size="9.5" font-weight="800" text-anchor="middle" dominant-baseline="central">${lvl}</text>`;
 }

 // ── 5. LINHAS RADIAIS SEPARADORAS DOS 12 SECTORES ──
 for (let i = 0; i < 12; i++) {
 const angleRad = ((-90 + i * sectorAngle) * Math.PI) / 180;
 const x1 = cx + minR * Math.cos(angleRad);
 const y1 = cy + minR * Math.sin(angleRad);
 const x2 = cx + maxR * Math.cos(angleRad);
 const y2 = cy + maxR * Math.sin(angleRad);

 body += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i % 3 === 0 ? '#0F172A' : 'rgba(100, 116, 139, 0.5)'}" stroke-width="${i % 3 === 0 ? '2.5' : '1'}" />`;
 }

 // Hub Central
 body += `<circle cx="${cx}" cy="${cy}" r="${minR}" fill="#0F172A" stroke="#FFFFFF" stroke-width="2.5" />`;

 defs += `</defs>`;

 const svg = `<svg viewBox="0 0 600 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:block; overflow:visible; font-family:'Inter', system-ui, sans-serif;">${defs}${body}</svg>`;

 container.innerHTML = svg;
}

// ── GERADOR VETORIAL SVG MAPA DE IMPACTO (LIMPO, RADAR STANDALONE) ──
function rv_renderSVGImpactMap() {
 const container = document.getElementById('rv-impacto-svg-wrapper');
 if (!container) return;

 const cx = 320;
 const cy = 320;
 const minR = 25;
 const maxR = 190;
 const sectorAngle = 30; // 360 / 12 = 30 deg

 let defs = `<defs>`;
 let body = ``;

 // Gradient para o Mapa de Impacto
 defs += `
 <linearGradient id="rv-impact-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3B82F6" stop-opacity="0.30"/><stop offset="100%" stop-color="#6366F1" stop-opacity="0.18"/></linearGradient>
 `;

 // Sem círculos ou anéis de escala no fundo

 // 2. Eixos Radiais dos 12 Domínios e Palavras (Rótulos) com Dots Coloridos
 for (let i = 0; i < 12; i++) {
 const midDeg = -75 + i * sectorAngle;
 const midRad = (midDeg * Math.PI) / 180;
 const d = RV_DOMINIOS[i];

 const x2 = cx + maxR * Math.cos(midRad);
 const y2 = cy + maxR * Math.sin(midRad);

 // Linha radial
 body += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#94A3B8" stroke-width="1.2" />`;

 // Dot colorido do domínio na ponta do eixo
 const dotR = maxR + 10;
 const dx = cx + dotR * Math.cos(midRad);
 const dy = cy + dotR * Math.sin(midRad);
 body += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4.5" fill="${d.color}" stroke="#FFFFFF" stroke-width="1.5" />`;

 // Texto com a palavra/nome do domínio
 const labelR = maxR + 24;
 const lx = cx + labelR * Math.cos(midRad);
 const ly = cy + labelR * Math.sin(midRad);

 const cosVal = Math.cos(midRad);
 let align = 'middle';
 if (cosVal> 0.25) align = 'start';
 else if (cosVal < -0.25) align = 'end';

 body += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#1E293B" font-size="10.5" font-weight="700" text-anchor="${align}" dominant-baseline="central">${d.name}</text>`;
 }

 // 3. Polígono do Mapa de Impacto
 const points = [];
 for (let i = 0; i < 12; i++) {
 const midDeg = -75 + i * sectorAngle;
 const midRad = (midDeg * Math.PI) / 180;
 const score = rv_scores[i];
 const r = minR + (score / 10) * (maxR - minR);
 const px = cx + r * Math.cos(midRad);
 const py = cy + r * Math.sin(midRad);
 points.push({ x: px, y: py, score, domain: RV_DOMINIOS[i] });
 }

 const polyPoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

 body += `<polygon points="${polyPoints}" fill="url(#rv-impact-grad)" stroke="none" />`;
 body += `<polygon points="${polyPoints}" fill="none" stroke="#2563EB" stroke-width="3" stroke-linejoin="round" style="filter: drop-shadow(0 4px 8px rgba(37, 99, 235, 0.35));" />`;

 // 4. Nodos de Dados e Badges com Valores das Notas
 points.forEach(p => {
 body += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" />`;
 body += `<rect x="${(p.x - 9).toFixed(1)}" y="${(p.y - 20).toFixed(1)}" width="18" height="14" rx="4" fill="#1E3A8A" />`;
 body += `<text x="${p.x.toFixed(1)}" y="${(p.y - 13).toFixed(1)}" fill="#FFFFFF" font-size="10" font-weight="900" text-anchor="middle" dominant-baseline="central">${p.score}</text>`;
 });

 // Hub Central Escuro
 body += `<circle cx="${cx}" cy="${cy}" r="10" fill="#0F172A" stroke="#FFFFFF" stroke-width="2" />`;

 defs += `</defs>`;

 const svg = `<svg viewBox="0 0 640 640" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block; overflow:visible; font-family:'Inter', system-ui, sans-serif;">${defs}${body}</svg>`;

 container.innerHTML = svg;
}

let rv_planos_acao = Array(12).fill('');

window.rv_setPlanoAcao = function(index, text) {
 rv_planos_acao[index] = text;
};

// ── CAMPOS DE MAIOR ATENÇÃO (APENAS PONTUAÇÕES ABAIXO DE 5 E PLANO DE AÇÃO) ──
function rv_renderCamposAtencao() {
 const container = document.getElementById('rv-atencao-container');
 if (!container) return;

 // Mapear domínios com notas, observações e plano de ação
 const dominiosComScores = RV_DOMINIOS.map((d, index) => ({
 ...d,
 index,
 score: rv_scores[index],
 obs: rv_observations[index],
 plano: rv_planos_acao[index] || ''
 }));

 // Ordenar por score ascendente (menores notas primeiro)
 dominiosComScores.sort((a, b) => a.score - b.score);

 // Filtrar estritamente áreas com pontuação abaixo de 5 (score < 5)
 const criticos = dominiosComScores.filter(d => d.score < 5);

 if (criticos.length === 0) {
 container.innerHTML = `
 <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:12px; padding:18px; text-align:center; color:#166534;"><div style="font-size:15px; font-weight:800; margin-bottom:4px;">Nenhum campo crítico (abaixo de 5)</div>
 <div style="font-size:12.5px; color:#15803D;">Todos os 12 domínios avaliados estão com pontuação igual ou superior a 5!</div>
 </div>
 `;
 return;
 }

 let html = '';
 criticos.forEach(d => {
 html += `
 <div style="background:#FAFAFA; border:1px solid #E2E8F0; border-left:4px solid #EF4444; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,0.02);"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;"><div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${d.color};"></span>
 <strong style="font-size:15px; color:#1E293B; font-family:'Inter', sans-serif;">${d.name}</strong>
 <span style="font-size:11px; font-weight:600; color:#64748B; background:#F1F5F9; padding:2px 8px; border-radius:10px;">${d.quad}</span>
 </div>
 <div style="display:flex; align-items:center; gap:6px;"><span style="background:#FEE2E2; color:#991B1B; font-size:12px; font-weight:800; padding:3px 10px; border-radius:12px;">Score: ${d.score} / 10 — Crítico (&lt; 5)
 </span>
 </div>
 </div>

 <!-- Barra de Progresso Visual -->
 <div style="width:100%; background:#E2E8F0; height:6px; border-radius:3px; overflow:hidden;"><div style="width:${d.score * 10}%; background:#EF4444; height:100%; border-radius:3px;"></div>
 </div>

 <!-- Observação do Mentor -->
 <div style="font-size:12px; color:#475569; font-style:italic;">${d.obs ? ` <strong>Notas do Mentor:</strong> "${d.obs}"` : '<span style="color:#94A3B8;">Nenhuma observação prévia informada.</span>'}
 </div>

 <!-- CAMPO DE PLANO DE AÇÃO -->
 <div style="margin-top:2px;"><label style="font-size:12px; font-weight:700; color:#1E293B; display:flex; align-items:center; gap:6px; margin-bottom:6px;"><strong>Plano de ação:</strong>
 </label>
 <textarea id="rv-plano-${d.index}" oninput="rv_setPlanoAcao(${d.index}, this.value)" placeholder="Descreva as ações práticas, metas e prazos para melhorar ${d.name}..." style="width:100%; min-height:65px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-family:inherit; font-size:12px; line-height:1.4; outline:none; resize:vertical; background:#fff;">${d.plano}</textarea>
 </div>

 <div style="display:flex; justify-content:flex-end;"><button type="button" onclick="rv_focarCampo(${d.index})" style="background:#F1F5F9; border:1px solid #CBD5E1; color:#334155; font-size:11px; font-weight:700; padding:5px 12px; border-radius:8px; cursor:pointer; transition:0.15s;">Ajustar Slider 
 </button>
 </div>
 </div>
 `;
 });

 container.innerHTML = html;
}

// ── EXPORTAR PDF DO PLANO DE AÇÃO E CAMPOS DE MAIOR ATENÇÃO ──
window.rv_exportarPDFPlanoAcao = function() {
 // Abrir janela dedicada síncrona no clique para evitar bloqueio de pop-up
 const printWin = (typeof mentoraJanelaImpressao === 'function') ? mentoraJanelaImpressao() : window.open('', '_blank', 'width=900,height=950');
 if (!printWin) {
 alert("Por favor, permita janelas pop-up no navegador para visualizar o relatório PDF.");
 return;
 }

 const sel = document.getElementById('rv-mentorado-select');
 const selId = sel ? sel.value : '';

 let menteeObj = null;
 if (selId && typeof cp_mentees !== 'undefined') {
 menteeObj = cp_mentees.find(m => String(m.id) === String(selId));
 }
 if (!menteeObj && typeof cp_currentMentee !== 'undefined' && cp_currentMentee) {
 menteeObj = cp_currentMentee;
 }

 const nomeMentorado = menteeObj?.nome || (sel && sel.value && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : 'Mentorado');
 const dataAtual = new Date().toLocaleDateString('pt-BR');
 const diagGeral = document.getElementById('rv-diagnostico-geral')?.value || 'Nenhum diagnóstico geral informado pelo mentor.';

 const sum = rv_scores.reduce((a, b) => a + b, 0);
 const avg = (sum / 12).toFixed(1);

 let maxIdx = 0;
 let minIdx = 0;
 for (let i = 1; i < 12; i++) {
 if (rv_scores[i]> rv_scores[maxIdx]) maxIdx = i;
 if (rv_scores[i] < rv_scores[minIdx]) minIdx = i;
 }
 const maxDomName = RV_DOMINIOS[maxIdx].name;
 const minDomName = RV_DOMINIOS[minIdx].name;

 // Filtrar domínios abaixo de 5
 const criticos = RV_DOMINIOS.map((d, index) => ({
 ...d,
 index,
 score: rv_scores[index],
 obs: rv_observations[index],
 plano: rv_planos_acao[index] || ''
 })).filter(d => d.score < 5);

 let criticosHTML = '';
 if (criticos.length === 0) {
 criticosHTML = `<div style="padding:14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; color:#166534; font-size:13px; font-weight:600;">Todos os 12 domínios apresentam pontuação satisfatória (≥ 5/10).</div>`;
 } else {
 criticos.forEach(d => {
 criticosHTML += `
 <div style="margin-bottom:12px; padding:14px; border:1px solid #fee2e2; border-left:4px solid #ef4444; border-radius:8px; background:#fffafa; page-break-inside:avoid;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><strong style="font-size:14px; color:#1e293b;">${d.name} (${d.quad})</strong>
 <span style="background:#fee2e2; color:#991b1b; font-weight:800; font-size:11px; padding:3px 10px; border-radius:10px;">Nota: ${d.score} / 10 — Crítico</span>
 </div>
 ${d.obs ? `<div style="font-size:12px; color:#475569; margin-bottom:8px;"><strong>Observação:</strong> ${d.obs}</div>` : ''}
 <div style="padding:10px; background:#fff; border:1px solid #e2e8f0; border-radius:6px;"><strong style="font-size:11.5px; color:#0f172a; display:block; margin-bottom:4px;">Plano de Ação:</strong>
 <div style="font-size:12px; color:#334155; white-space:pre-wrap;">${d.plano || 'Nenhum plano de ação registrado.'}</div>
 </div>
 </div>
 `;
 });
 }

 // Grid dos 12 domínios
 let dominosHTML = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">`;
 RV_DOMINIOS.forEach((d, i) => {
 const sc = rv_scores[i];
 const isCritico = sc < 5;
 const badgeBg = isCritico ? '#ef4444' : '#4f46e5';
 dominosHTML += `
 <div style="background:#f8fafc; border:1px solid ${isCritico ? '#fca5a5' : '#e2e8f0'}; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; page-break-inside:avoid;"><span style="font-size:12px; font-weight:600; color:#1e293b;">${d.name}</span>
 <span style="background:${badgeBg}; color:#fff; font-weight:800; font-size:11px; padding:2px 8px; border-radius:6px;">${sc}/10</span>
 </div>
 `;
 });
 dominosHTML += `</div>`;

 const svgWheel = document.getElementById('rv-svg-wrapper')?.innerHTML || '';
 const svgImpacto = document.getElementById('rv-impacto-svg-wrapper')?.innerHTML || '';

 const printDocument = `
 <!DOCTYPE html>
 <html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Roda da Vida — ${nomeMentorado}</title>
 <style>@page { size: A4 portrait; margin: 10mm; }
 * { box-sizing: border-box; margin: 0; padding: 0; }
 body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1e293b; padding: 20px; background: #ffffff; line-height: 1.4; width: 100%; }
 .rv-card { page-break-inside: avoid; }
 </style>
 </head>
 <body><div style="padding: 10px; background:#ffffff; color:#1e293b; max-width:800px; margin:0 auto;"><!-- HEADER -->
 <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #5b2da3; padding-bottom:12px; margin-bottom:16px;"><div><div style="font-size:22px; font-weight:800; color:#5b2da3; font-family:'Playfair Display',serif;">Mentóra — Roda da Vida</div>
 <div style="font-size:12px; color:#64748b; margin-top:2px;">Relatório Individual de Autoconhecimento e Diagnóstico Estratégico</div>
 </div>
 <div style="text-align:right; font-size:12.5px; color:#334155; line-height:1.4;"><div><strong>Mentorado:</strong> ${nomeMentorado}</div>
 <div><strong>Data:</strong> ${dataAtual}</div>
 <div><strong>Média Geral:</strong> <span style="color:#5b2da3; font-weight:800;">${avg} / 10</span></div>
 </div>
 </div>

 <!-- HIGHLIGHT SUMMARY CARDS -->
 <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:16px;"><div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center;"><div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">MÉDIA GERAL</div>
 <div style="font-size:20px; font-weight:800; color:#5b2da3;">${avg}</div>
 <div style="font-size:10px; color:#64748b;">de 10.0</div>
 </div>
 <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px; text-align:center;"><div style="font-size:10px; font-weight:700; color:#166534; text-transform:uppercase;">MAIOR FORÇA</div>
 <div style="font-size:12px; font-weight:700; color:#15803d; margin-top:4px;">${maxDomName} (${rv_scores[maxIdx]}/10)</div>
 </div>
 <div style="background:#fffafa; border:1px solid #fee2e2; border-radius:8px; padding:10px; text-align:center;"><div style="font-size:10px; font-weight:700; color:#991b1b; text-transform:uppercase;">MAIOR ALAVANCA</div>
 <div style="font-size:12px; font-weight:700; color:#b91c1c; margin-top:4px;">${minDomName} (${rv_scores[minIdx]}/10)</div>
 </div>
 </div>

 <!-- RODA DA VIDA -->
 <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-bottom:16px; page-break-inside:avoid; text-align:center;"><div style="font-size:11px; font-weight:700; color:#5b2da3; text-transform:uppercase; margin-bottom:6px;">Roda da Vida</div>
 <div style="width:300px; height:300px; margin:0 auto;">${svgWheel}</div>
 </div>

 <!-- 12 DOMAINS LIST -->
 <div style="font-size:12px; font-weight:700; color:#5b2da3; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:8px;">Pontuação dos 12 Domínios</div>
 ${dominosHTML}

 <!-- CAMPOS CRÍTICOS & PLANOS DE AÇÃO -->
 <div style="font-size:12px; font-weight:700; color:#ef4444; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin:16px 0 10px 0;">Campos de Maior Atenção (&lt; 5) & Plano de Ação</div>
 ${criticosHTML}

 <!-- DIAGNÓSTICO DO MENTOR -->
 <div style="font-size:12px; font-weight:700; color:#5b2da3; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin:16px 0 10px 0;">Diagnóstico Estratégico do Mentor</div>
 <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:14px; border-radius:8px; font-size:12.5px; color:#334155; white-space:pre-wrap; line-height:1.5;">${diagGeral}</div>
 ${window.rv_ultimaAnaliseAgente ? `<div style="font-size:12px; font-weight:700; color:#2563eb; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin:16px 0 10px 0;">Análise com Agente Mentóra</div><div style="background:#eff6ff; border:1px solid #bfdbfe; padding:14px; border-radius:8px; font-size:12.5px; color:#1e293b; white-space:pre-wrap; line-height:1.55;">${String(window.MentoraPDF ? MentoraPDF.textoAgente(window.rv_ultimaAnaliseAgente) : window.rv_ultimaAnaliseAgente).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>` : ''}

 <!-- FOOTER -->
 <div style="margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:10.5px; color:#94a3b8; text-align:center;">Plataforma Mentóra — Relatório de Autoconhecimento &middot; Mentorado: ${nomeMentorado} &middot; Data: ${dataAtual}
 </div>
 </div>
 </body>
 </html>
 `;

 printWin.document.open();
 printWin.document.write(printDocument);
 printWin.document.close();

 // Executar a impressão na nova janela isolada
 setTimeout(function() {
 printWin.focus();
 printWin.print();
 }, 300);
};

window.rv_imprimirRelatorio = function() {
 window.rv_exportarPDFPlanoAcao();
};

// ── AJUDANTE: SCROLL E FOCO NO CAMPO DE ENTRADA DO DOMÍNIO ──
window.rv_focarCampo = function(index) {
 const slider = document.getElementById(`rv-slider-${index}`);
 if (slider) {
 slider.scrollIntoView({ behavior: 'smooth', block: 'center' });
 slider.focus();
 }
};

// ── 3. ATUALIZAR MÉTRICAS E RESUMO ──
function rv_updateMetrics() {
 const sum = rv_scores.reduce((a, b) => a + b, 0);
 const avg = (sum / 12).toFixed(1);

 const elMedia = document.getElementById('rv-val-media');
 if (elMedia) elMedia.textContent = avg;

 let maxIdx = 0;
 let minIdx = 0;
 for (let i = 1; i < 12; i++) {
 if (rv_scores[i]> rv_scores[maxIdx]) maxIdx = i;
 if (rv_scores[i] < rv_scores[minIdx]) minIdx = i;
 }

 const elForca = document.getElementById('rv-val-forca');
 if (elForca) elForca.textContent = `${RV_DOMINIOS[maxIdx].name} (${rv_scores[maxIdx]})`;

 const elAlavanca = document.getElementById('rv-val-alavanca');
 if (elAlavanca) elAlavanca.textContent = `${RV_DOMINIOS[minIdx].name} (${rv_scores[minIdx]})`;
}

// ── REDEFINIR VALORES PADRÃO (5) ──
window.rv_resetarValores = function() {
 if (confirm("Deseja redefinir todos os valores da Roda da Vida para o padrão 5?")) {
 rv_scores = Array(12).fill(5);
 rv_observations = Array(12).fill('');
 rv_planos_acao = Array(12).fill('');
 const diag = document.getElementById('rv-diagnostico-geral');
 if (diag) diag.value = '';
 window.rv_ultimaAnaliseAgente = '';
 const ia = document.getElementById('rv-ai-resultado');
 if (ia) { ia.textContent = ''; ia.style.display = 'none'; }

 rv_renderQuadrantsUI();
 rv_updateAll();
 }
};

// ── SALVAR PRONTUÁRIO NO SUPABASE / BANCO DE DADOS E MEMÓRIA ──
window.rv_salvarProntuario = async function() {
 const sel = document.getElementById('rv-mentorado-select');
 const selId = sel ? sel.value : '';

 let menteeObj = null;
 if (selId && typeof cp_mentees !== 'undefined') {
 menteeObj = cp_mentees.find(m => String(m.id) === String(selId));
 }
 if (!menteeObj && typeof cp_currentMentee !== 'undefined' && cp_currentMentee) {
 menteeObj = cp_currentMentee;
 }

 if (!menteeObj) {
 alert("Por favor, selecione para qual mentorado deseja salvar este diagnóstico no menu ' Selecione o Mentorado' no topo da página.");
 if (sel) sel.focus();
 return;
 }

 const diagGeral = document.getElementById('rv-diagnostico-geral')?.value || '';
 
 // Domínios críticos abaixo de 5 com os planos de ação
 const camposAtencaoAbaixo5 = RV_DOMINIOS.map((d, i) => ({
 name: d.name,
 quad: d.quad,
 score: rv_scores[i],
 obs: rv_observations[i],
 planoAcao: rv_planos_acao[i] || ''
 })).filter(d => d.score < 5);

 const payloadData = {
 sessType: 'rodavida',
 date: (typeof cp_chaveDia === 'function' ? cp_chaveDia(Date.now()) : new Date().toLocaleDateString('sv-SE')),
 createdAt: Date.now(),
 mentorNotes: diagGeral,
 scores: rv_scores,
 observacoes: rv_observations,
 planosAcao: rv_planos_acao,
 diagnosticoGeral: diagGeral,
 // análise gerada pelo Agente Mentóra (se o mentor gerou antes de salvar)
 aiAnalysis: window.rv_ultimaAnaliseAgente || '',
 camposAtencaoAbaixo5: camposAtencaoAbaixo5,
 dominios: RV_DOMINIOS.map((d, i) => ({
 name: d.name,
 quad: d.quad,
 score: rv_scores[i],
 obs: rv_observations[i],
 planoAcao: rv_planos_acao[i] || ''
 }))
 };

 const payload = {
 mentorado_id: menteeObj.id,
 tipo: 'rodavida',
 dados: payloadData,
 created_at: new Date().toISOString()
 };

 // Atualizar Prontuário em Memória para exibição imediata na aba Prontuário
 if (menteeObj) {
 if (!menteeObj.prontuario) menteeObj.prontuario = [];
 menteeObj.prontuario.unshift({
 id: 'rv-' + Date.now(),
 tipo: 'Roda da Vida, Campos de Atenção & Plano de Ação',
 data: new Date().toLocaleDateString('pt-BR'),
 detalhes: payloadData
 });
 
 // Se existir a função de renderizar timeline/prontuário, executa imediatamente
 if (typeof cp_renderMenteeProntuario === 'function') {
 cp_renderMenteeProntuario();
 }
 }

 try {
 if (window.supabaseClient) {
 const { data: insertedData, error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([payload])
 .select();
 
 if (error) throw error;

 if (insertedData && insertedData[0] && typeof cp_all_sessions !== 'undefined') {
 cp_all_sessions.unshift(insertedData[0]);
 }
 alert("Diagnóstico da Roda da Vida, Campos de Atenção (< 5) e Plano de Ação salvos no prontuário de " + (menteeObj.nome || 'Mentorado') + "!");
 } else {
 alert("Banco de dados não conectado. A Roda da Vida NÃO foi salva.");
 }
 } catch (err) {
 console.error("Erro ao salvar no banco:", err);
 alert("A Roda da Vida NÃO foi salva no banco de dados. Tente novamente.\n\nDetalhe: " + (err.message || "desconhecido"));
 } finally {
 // Sincronizar e re-renderizar o Prontuário automaticamente em tempo real (sem precisar de F5)
 if (typeof cp_init === 'function') {
 await cp_init();
 if (typeof cp_openProfile === 'function' && menteeObj.id) {
 cp_openProfile(menteeObj.id);
 if (typeof cp_switchTab === 'function') {
 cp_switchTab('historico');
 }
 }
 }
 }
};
