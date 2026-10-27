import io, os, re, base64
# Ensambla paleta.html (editor de paleta · Papel de almacén). Uso: python build-paleta.py
SP = os.path.dirname(os.path.abspath(__file__))
FONTS = os.environ.get('FONTS_DIR') or os.path.join(SP, 'fonts')
def rd(p): return io.open(os.path.join(SP, p), encoding='utf-8').read()
def b64(name):
    for root, _, files in os.walk(FONTS):
        if name + '.woff2' in files:
            return base64.b64encode(open(os.path.join(root, name + '.woff2'), 'rb').read()).decode('ascii')
    raise FileNotFoundError(name)

CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>'
def row(name, meta, cls='', trail='', match=False):
    m = 'match' if match else 'nomatch'
    hi = ' matchhi' if match and 'done' not in cls else ''
    return f'<li class="row {cls} {m}{hi}"><span class="check">{CHECK}</span><span class="txt"><span class="name">{name}</span><span class="meta">{meta}</span></span><span class="trail">{trail}</span></li>'
rows = '\n'.join([
    row('Leche', 'Papá · hace 2 h', trail='<span>›</span>'),
    row('Yerba (la de siempre)', 'Vos · ayer', trail='<span>›</span>'),
    row('Papel de cocina', 'Mamá · lun', trail='<span>›</span>'),
    row('Cerveza', 'Papá · recién', trail='<span>›</span>'),
    row('Yogur de frutilla', 'Papá · ayer', trail='<span>›</span>', match=True),
    row('Helado de dulce de leche', 'Vos · recién', trail='<span class="dot" title="pendiente de sincronizar"></span><span>›</span>'),
])
PHONE = f'''<div class="phone"><div class="screen">
  <header class="top"><span class="brand">Heladera</span><span class="pill live"><i></i>En vivo</span><span class="avatar">A</span><button class="more" aria-label="Menú">⋯</button></header>
  <div class="counter"><span class="num">Faltan 6</span><span class="match">· 1 coincide</span></div>
  <div class="listwrap">
    <ul class="list">
{rows}
    </ul>
    <div class="filter-extra">
      <div class="sec">Ya lo compraron</div>
      <ul class="list"><li class="row done match"><span class="check">{CHECK}</span><span class="txt"><span class="name">Yogur natural</span><span class="meta">✓ Mamá · lun</span></span><span class="trail"><span class="linkbtn">volver a anotar</span></span></li></ul>
      <div class="sec">Lo compraste otras veces</div>
      <div class="chips"><span class="chip">+ Yogur griego</span><span class="chip">+ Yogur bebible</span></div>
    </div>
  </div>
  <div class="donebar"><span>▸ Comprados (3)</span><b>Vaciar</b></div>
  <form class="inputbar" onsubmit="return false"><div class="field"><span class="ph">Anotá o buscá…</span><span class="typed">yogur</span><span class="caret"></span></div><button class="add" type="button"><span class="lbl1">Agregar</span><span class="lbl2">Agregar «yogur»</span></button></form>
  <div class="scrim"></div>
  <div class="sheet"><div class="handle"></div><h4>¿Quién sos?</h4><p>Así los demás saben quién anotó qué. Sin contraseña ni nada.</p><div class="chips"><span class="chip sel">Ana</span><span class="chip">Mamá</span><span class="chip">Papá</span><span class="chip other">Otro nombre…</span></div><button class="cta" type="button">Soy yo</button></div>
</div></div>'''
ANAT = f'''<div class="anat">
  <div class="anrow"><span class="cap">Casilla: pendiente · en espera · comprado</span>
    <div class="demo-row row"><span class="check">{CHECK}</span><span class="txt"><span class="name" style="font-size:15px">Yerba</span></span></div>
    <div class="demo-row row hold"><span class="check">{CHECK}</span><span class="txt"><span class="name" style="font-size:15px">Yerba</span></span></div>
    <div class="demo-row row done"><span class="check">{CHECK}</span><span class="txt"><span class="name" style="font-size:15px">Yerba</span></span></div>
  </div>
  <div class="anrow"><span class="cap">Botones · confirmación · toast</span>
    <button class="btn2" type="button">Agregar</button><button class="btn-text" type="button">Vaciar</button><button class="btn-conf" type="button">¿Vaciar los 4? Sí</button>
    <div class="toast">Borraste «Yerba» <b>Deshacer</b></div>
  </div>
  <div class="anrow"><span class="cap">Pastillas · chips · personas</span>
    <span class="pill live"><i></i>En vivo</span><span class="pill"><i></i>Sin conexión</span><span class="pill sync"><i></i>Sincronizando…</span>
    <span class="chip">+ Yogur griego</span><span class="chip sel">Mamá</span>
    <span class="people"><span class="avatar">A</span><span class="avatar" style="background:var(--p2)">M</span><span class="avatar" style="background:var(--p3)">P</span><span class="avatar" style="background:var(--p4)">O</span></span>
  </div>
</div>'''
tpl = rd('paleta.template.html')
html = tpl.replace('__PHONE__', PHONE).replace('__ANAT__', ANAT)
for ph, f in [('__FONT_FRAUNCES__','fraunces-latin-full-normal'),('__FONT_DMSANS__','dm-sans-latin-wght-normal'),('__FONT_MONO__','jetbrains-mono-latin-wght-normal')]:
    html = html.replace(ph, b64(f))
left = sorted(set(re.findall(r'__[A-Z_]+__', html)))
assert not left, left
out = os.environ.get('OUT') or os.path.join(SP, 'paleta.html')
io.open(out, 'w', encoding='utf-8').write(html)
print('OK', out, len(html))
