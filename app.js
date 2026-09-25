const $ = id => document.getElementById(id);
const money = (n, c = 'BRL') => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: c
}).format(Number(n));
const date = s => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
const state = {
    items: [],
    selected: new Set(),
    editing: null,
    deleting: null,
    busy: false,
    simulation: 0,
    pending: false,
    projection: 0
};
const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
};
async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (!res.ok) {
        let p;
        try {
            p = await res.json()
        } catch {}
        throw new Error(typeof p?.detail === 'string' ? p.detail : res.status === 422 ? 'Confira os campos e os valores informados.' : 'Não foi possível concluir a operação. Tente novamente.');
    }
    return res.status === 204 ? null : res.json();
}

function notice(message, success = false) {
    $('notice').textContent = message;
    $('notice').hidden = false;
    $('notice').className = success ? 'success' : '';
}

function render() {
    const term = $('search').value.toLocaleLowerCase('pt-BR');
    const status = $('status').value;
    const items = state.items.filter(x => (x.nome + ' ' + x.categoria).toLocaleLowerCase('pt-BR').includes(term) && (status === 'all' || x.ativo === (status === 'active'))).sort((a, b) => $('sort').value === 'name' ? a.nome.localeCompare(b.nome) : a.proxima_cobranca.localeCompare(b.proxima_cobranca));
    $('rows').replaceChildren();
    $('empty').hidden = state.items.length !== 0;
    $('no-results').hidden = !state.items.length || items.length !== 0;
    $('list-count').textContent = `${items.length} de ${state.items.length} assinaturas`;
    for (const item of items) {
        const row = el('tr');
        const checkCell = el('td');
        const check = el('input');
        check.type = 'checkbox';
        check.disabled = !item.ativo;
        check.checked = state.selected.has(item.id);
        check.setAttribute('aria-label', 'Simular cancelamento de ' + item.nome);
        check.onchange = () => {
            check.checked ? state.selected.add(item.id) : state.selected.delete(item.id);
            simulate();
        };
        checkCell.append(check);
        row.append(checkCell);
        const service = el('td');
        const wrap = el('div', 'service');
        wrap.append(el('span', 'avatar', item.nome.slice(0, 2).toUpperCase()));
        const label = el('div');
        label.append(el('strong', '', item.nome), el('small', '', item.categoria));
        wrap.append(label);
        service.append(wrap);
        row.append(service);
        const price = el('td', 'price');
        price.append(el('strong', '', money(item.valor, item.moeda)), el('small', '', item.periodicidade === 'anual' ? 'por ano' : 'por mês'));
        row.append(price);
        const due = el('td', '', date(item.proxima_cobranca));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((new Date(item.proxima_cobranca + 'T00:00:00') - today) / 86400000);
        if (item.ativo && days <= 7) {
            due.append(el('small', 'due ' + (days < 0 ? 'overdue' : ''), days < 0 ? 'Data passada · revise o cadastro' : days === 0 ? 'Prevista para hoje' : `Em ${days} dia(s)`));
        }
        row.append(due);
        const situation = el('td');
        situation.append(el('span', 'badge' + (item.ativo ? '' : ' off'), item.ativo ? 'Ativa' : 'Cancelada'));
        row.append(situation);
        const actions = el('td');
        const edit = el('button', 'row-action', 'Editar');
        edit.setAttribute('aria-label', 'Editar ' + item.nome);
        edit.onclick = () => openEditor(item);
        const remove = el('button', 'row-action remove', 'Excluir');
        remove.setAttribute('aria-label', 'Excluir ' + item.nome);
        remove.onclick = () => {
            state.deleting = item;
            $('delete-name').textContent = item.nome;
            $('delete-error').hidden = true;
            $('delete-dialog').showModal();
        };
        actions.append(edit, remove);
        row.append(actions);
        $('rows').append(row);
    }
}
async function simulate() {
    const seq = ++state.simulation;
    if (!state.selected.size) {
        $('saving').textContent = money(0);
        $('saving-year').textContent = money(0);
        $('simulation-info').textContent = 'Simulação apenas. Seus serviços não serão cancelados.';
        return;
    }
    $('saving').textContent = '…';
    $('saving-year').textContent = '…';
    try {
        const query = new URLSearchParams();
        state.selected.forEach(id => query.append('excluir_ids', id));
        const {
            resultado: r
        } = await api('/analises/economia?' + query);
        if (seq !== state.simulation) return;
        $('saving').textContent = money(r.economia_mensal);
        $('saving-year').textContent = money(r.economia_anual);
        $('simulation-info').textContent = `${state.selected.size} selecionada(s). A simulação não altera os cadastros.`;
    } catch (e) {
        if (seq !== state.simulation) return;
        $('saving').textContent = '—';
        $('saving-year').textContent = '—';
        $('simulation-info').textContent = e.message;
    }
}
async function refresh() {
    if (state.busy) {
        state.pending = true;
        return;
    }
    state.busy = true;
    $('refresh').disabled = true;
    try {
        let items = [],
            offset = 0;
        while (true) {
            const page = await api('/assinaturas?limite=100&offset=' + offset);
            items.push(...page.itens);
            offset += page.itens.length;
            if (offset >= page.total || !page.itens.length) break;
        }
        state.items = items;
        state.selected = new Set([...state.selected].filter(id => items.some(x => x.id === id && x.ativo)));
        render();
        $('count').textContent = items.filter(x => x.ativo).length;
        const results = await Promise.allSettled([api('/analises/resumo'), api('/analises/categorias')]);
        const summary = results[0];
        if (summary.status === 'fulfilled') {
            const r = summary.value;
            $('monthly').textContent = money(r.resultado.mensal);
            $('annual').textContent = money(r.resultado.anual);
            $('quotes').replaceChildren();
            for (const q of r.cotacoes) $('quotes').append(el('p', '', `${q.moeda} → BRL: ${Number(q.taxa).toLocaleString('pt-BR',{maximumFractionDigits:6})} · ${date(q.data)} · ${q.fonte}`));
            if (!r.cotacoes.length) $('quotes').textContent = 'Cadastre uma assinatura para consultar referências.';
        } else {
            $('monthly').textContent = 'Indisponível';
            $('annual').textContent = '—';
            $('quotes').textContent = 'Cotações indisponíveis nesta atualização.';
            notice('Cadastros carregados. ' + summary.reason.message);
        }
        $('categories').replaceChildren();
        if (results[1].status === 'fulfilled') {
            const groups = results[1].value.resultado.categorias;
            if (!groups.length) $('categories').append(el('p', 'muted', 'Seu mapa de gastos aparecerá aqui após o primeiro cadastro ativo.'));
            for (const g of groups) {
                const entry = el('div');
                const top = el('div', 'cat-top');
                top.append(el('span', '', g.categoria), el('span', '', money(g.mensal) + ' · ' + Number(g.percentual).toLocaleString('pt-BR', {
                    maximumFractionDigits: 2
                }) + '%'));
                const track = el('div', 'track');
                const fill = el('div', 'fill');
                fill.style.width = Math.min(100, Math.max(0, Number(g.percentual))) + '%';
                track.append(fill);
                entry.append(top, track);
                $('categories').append(entry);
            }
        } else {
            $('categories').append(el('p', 'muted', 'Análise de categorias indisponível. Seus cadastros continuam acessíveis.'));
        }
        await Promise.all([simulate(), project()]);
    } catch (e) {
        $('monthly').textContent = '—';
        $('annual').textContent = '—';
        $('count').textContent = '—';
        $('categories').replaceChildren(el('p', 'muted', 'Não foi possível atualizar os dados.'));
        notice(e.message + ' Verifique se o Docker está em execução.');
    } finally {
        state.busy = false;
        $('refresh').disabled = false;
        if (state.pending) {
            state.pending = false;
            refresh();
        }
    }
}

function openEditor(item = null) {
    state.editing = item;
    $('form').reset();
    $('form-error').hidden = true;
    $('form-title').textContent = item ? 'Editar assinatura' : 'Nova assinatura';
    if (item) {
        for (const key of ['nome', 'categoria', 'valor', 'moeda', 'periodicidade', 'proxima_cobranca', 'ativo']) $('form').elements[key].value = String(item[key]);
    } else {
        const now = new Date();
        $('form').elements.proxima_cobranca.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
    $('editor').showModal();
}
$('form').onsubmit = async e => {
    e.preventDefault();
    $('save').disabled = true;
    $('form-error').hidden = true;
    const values = Object.fromEntries(new FormData($('form')));
    values.ativo = values.ativo === 'true';
    values.nome = values.nome.trim();
    values.categoria = values.categoria.trim();
    try {
        await api(state.editing ? '/assinaturas/' + state.editing.id : '/assinaturas', {
            method: state.editing ? 'PUT' : 'POST',
            body: JSON.stringify(values)
        });
        $('editor').close();
        notice('Assinatura salva.', true);
        await refresh();
    } catch (e) {
        $('form-error').textContent = e.message;
        $('form-error').hidden = false;
    } finally {
        $('save').disabled = false;
    }
};
$('delete-confirm').onclick = async () => {
    if (!state.deleting) return;
    $('delete-confirm').disabled = true;
    try {
        await api('/assinaturas/' + state.deleting.id, {
            method: 'DELETE'
        });
        state.selected.delete(state.deleting.id);
        $('delete-dialog').close();
        notice('Registro excluído.', true);
        await refresh();
    } catch (e) {
        $('delete-error').textContent = e.message;
        $('delete-error').hidden = false;
    } finally {
        $('delete-confirm').disabled = false;
    }
};
$('new').onclick = () => openEditor();
$('first').onclick = () => openEditor();
$('close').onclick = $('cancel').onclick = () => $('editor').close();
$('delete-cancel').onclick = () => $('delete-dialog').close();
$('refresh').onclick = () => {
    $('notice').hidden = true;
    refresh();
};
for (const id of ['search', 'status', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
document.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => {
    document.querySelectorAll('nav a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
}));
$('today').textContent = new Date().toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
});
refresh();

async function project() {
    const seq = ++state.projection;
    $('projection-total').textContent = 'Carregando…';
    try {
        const {
            resultado: r
        } = await api('/analises/projecao?meses=' + $('horizon').value);
        if (seq !== state.projection) return;
        $('projection-total').textContent = money(r.total);
        $('projection-chart').replaceChildren();
        for (const point of r.serie) {
            const bar = el('div', 'projection-bar');
            const fill = el('div', 'projection-fill');
            fill.style.height = (Number(r.total) > 0 ? Math.max(2, Number(point.acumulado) / Number(r.total) * 100) : 0) + '%';
            bar.title = `Mês ${point.mes}: ${money(point.acumulado)}`;
            bar.setAttribute('aria-label', bar.title);
            bar.setAttribute('role', 'img');
            bar.append(fill, el('small', '', point.mes));
            $('projection-chart').append(bar);
        }
    } catch (e) {
        if (seq !== state.projection) return;
        $('projection-total').textContent = 'Indisponível';
        $('projection-chart').replaceChildren(el('p', 'muted', e.message));
    }
}
$('horizon').onchange = project;
