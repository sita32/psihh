# Логическая схема БД «Рядом» для draw.io: таблицы с колонками PK/FK и полями из schema.sql,
# связи в нотации «вороньей лапки» (одна – ко многим). Файл открывается в draw.io и правится руками.
# Запуск из корня: python3 tools/er-drawio.py database/schema.sql > database/er-diagram.drawio
#                 python3 tools/er-drawio.py database/schema.sql --svg > database/er-diagram.svg  (та же схема картинкой)
import re
import sys
from xml.sax.saxutils import quoteattr

SQL = open(sys.argv[1]).read()
SKIP = ('CONSTRAINT', 'FOREIGN', 'REFERENCES', 'ON ', 'WITH', 'WHERE', 'USING', 'CHECK', 'PRIMARY', 'UNIQUE', 'EXCLUDE', '--', ')')

# ---------- Таблицы: поля, первичные и внешние ключи ----------
tables = {}
for m in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);', SQL, re.S):
    name, body = m.groups()
    pk = set()
    for c in re.findall(r'PRIMARY KEY \(([^)]*)\)', body):
        pk |= {x.strip() for x in c.split(',')}
    fks = {}                                    # поле -> таблица, на которую ссылается
    edges = {}                                  # поле, от которого рисуем линию связи
    for cols, ref in re.findall(r'FOREIGN KEY \(([^)]*)\)\s*REFERENCES (\w+)', body):
        names = [x.strip() for x in cols.split(',')]
        for x in names:
            fks.setdefault(x, ref)
        edges.setdefault(names[0], ref)         # составной ключ – одна линия от первого поля
    cols = []
    for line in body.split('\n'):
        line = line.strip().rstrip(',')
        if not line or line.startswith(SKIP):
            continue
        mm = re.match(r'(\w+)\s+(\w+)', line)
        if not mm or mm.group(2).isupper():
            continue
        col = mm.group(1)
        ref = re.search(r'REFERENCES (\w+)', line)
        if ref:
            fks[col] = edges[col] = ref.group(1)
        if 'PRIMARY KEY' in line:
            pk.add(col)
        cols.append(col)
    tables[name] = {'cols': cols, 'pk': pk, 'fk': fks, 'edges': edges}

# ---------- Раскладка: колонки по модулям, чтобы связи были короткими ----------
LAYOUT = [
    ['roles', 'role_permissions', 'permissions', 'user_permissions', 'user_roles'],
    ['users', 'user_blocks', 'notifications', 'audit_log'],
    ['client_profiles', 'conversations', 'messages'],
    ['appointments', 'appointment_status_history', 'payments', 'reviews'],
    ['schedule_slots', 'psychologist_services', 'session_formats'],
    ['psychologist_profiles'],
    ['methods', 'psychologist_methods', 'topics', 'psychologist_topics'],
    ['educations', 'documents', 'verification_requests'],
]
W, KEY_W, HEAD, ROW, GAP_X, GAP_Y = 230, 36, 30, 26, 120, 60

cells = []
pos = {}                                         # таблица -> (x, y, h, номер колонки)
order = {}                                       # таблица -> поля в порядке вывода
links = []                                       # (родитель, его PK, потомок, FK, вид конца)
row_id = {}                                      # (таблица, поле) -> id строки
nid = [2]


def new_id():
    nid[0] += 1
    return f'c{nid[0]}'


def esc(text):
    return quoteattr(text)


TABLE_STYLE = ('shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fixedRows=1;'
               'rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;fontFamily=Arial;fontSize=13;'
               'strokeColor=#000000;fillColor=#FFFFFF;')
ROW_STYLE = ('shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;'
             'dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom={b};html=1;')
CELL_STYLE = ('shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right={r};'
              'overflow=hidden;whiteSpace=wrap;html=1;fontFamily=Arial;fontSize=12;{extra}')

for ci, column in enumerate(LAYOUT):
    x = GAP_X + ci * (W + GAP_X)               # слева место под петли связей внутри первой колонки
    y = 40
    for name in column:
        t = tables[name]
        # Сначала поля первичного ключа, затем остальные – как в примере
        cols = [c for c in t['cols'] if c in t['pk']] + [c for c in t['cols'] if c not in t['pk']]
        h = HEAD + ROW * len(cols)
        tid = new_id()
        pos[name] = (x, y, h, ci)
        order[name] = cols
        cells.append(f'<mxCell id="{tid}" value={esc(name)} style="{TABLE_STYLE}" vertex="1" parent="1">'
                     f'<mxGeometry x="{x}" y="{y}" width="{W}" height="{h}" as="geometry"/></mxCell>')
        for i, col in enumerate(cols):
            rid = new_id()
            row_id[(name, col)] = rid
            last_pk = col in t['pk'] and (i + 1 == len(cols) or cols[i + 1] not in t['pk'])
            key = ','.join(k for k, ok in (('PK', col in t['pk']), ('FK', col in t['fk'])) if ok)
            cells.append(f'<mxCell id="{rid}" value="" style="{ROW_STYLE.format(b=1 if last_pk else 0)}" vertex="1" parent="{tid}">'
                         f'<mxGeometry y="{HEAD + i * ROW}" width="{W}" height="{ROW}" as="geometry"/></mxCell>')
            bold = 'fontStyle=1;' if col in t['pk'] else ''
            cells.append(f'<mxCell id="{new_id()}" value={esc(key)} style="{CELL_STYLE.format(r=1, extra="fontStyle=1;")}" vertex="1" parent="{rid}">'
                         f'<mxGeometry width="{KEY_W}" height="{ROW}" as="geometry"><mxRectangle width="{KEY_W}" height="{ROW}" as="alternateBounds"/></mxGeometry></mxCell>')
            name_style = CELL_STYLE.format(r=0, extra='align=left;spacingLeft=6;' + ('fontStyle=5;' if col in t['pk'] else bold))
            cells.append(f'<mxCell id="{new_id()}" value={esc(col)} style="{name_style}" vertex="1" parent="{rid}">'
                         f'<mxGeometry x="{KEY_W}" width="{W - KEY_W}" height="{ROW}" as="geometry"><mxRectangle width="{W - KEY_W}" height="{ROW}" as="alternateBounds"/></mxGeometry></mxCell>')
        y += h + GAP_Y

# ---------- Связи: от первичного ключа родителя к внешнему ключу потомка ----------
EDGE = ('edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#000000;'
        'endFill=0;startFill=0;startArrow=ERmandOne;endArrow={end};')
for child, t in tables.items():
    for col, parent in t['edges'].items():
        # Служебные ссылки «кто сделал» (granted_by, reviewed_by…) отмечены FK, но линиями не рисуем – иначе схема нечитаема
        if parent not in tables or col.endswith('_by'):
            continue
        parent_pk = next(iter(sorted(tables[parent]['pk'], key=tables[parent]['cols'].index)))
        # 1:1, если внешний ключ одновременно первичный (профили) или уникальный (отзыв на запись)
        one = col in t['pk'] and len(t['pk']) == 1 or re.search(rf'\n\s+{col}\s[^\n]*UNIQUE', SQL.split(f'CREATE TABLE {child} (')[1].split('\n);')[0])
        end = 'ERzeroToOne' if one else 'ERzeroToMany'
        links.append((parent, parent_pk, child, col, end))
        src, dst = row_id[(parent, parent_pk)], row_id[(child, col)]
        cells.append(f'<mxCell id="{new_id()}" style="{EDGE.format(end=end)}" edge="1" parent="1" source="{src}" target="{dst}">'
                     f'<mxGeometry relative="1" as="geometry"/></mxCell>')



def svg():
    """Та же схема в SVG: линии идут по промежуткам между колонками таблиц, длинные – по «коридору» сверху"""
    out, lines = [], []
    row_y = lambda t, c: pos[t][1] + HEAD + ROW * order[t].index(c) + ROW / 2
    used = {}                                    # промежуток или коридор -> сколько линий уже проложено

    def lane(key, base, step):
        used[key] = used.get(key, 0) + 1
        return base + step * used[key]

    def ends(x, y, d, kind):
        # d = +1, если линия уходит от таблицы вправо, -1 – влево
        p = []
        if kind == 'one':                        # «ровно один»: две черты
            for k in (9, 15):
                p.append(f'<path d="M{x + d * k} {y - 7}V{y + 7}"/>')
        else:
            if kind == 'many':                   # «много»: воронья лапка
                p.append(f'<path d="M{x} {y - 7}L{x + d * 14} {y}L{x} {y + 7}" fill="none"/>')
            else:                                # «не больше одного»: черта
                p.append(f'<path d="M{x + d * 9} {y - 7}V{y + 7}"/>')
            p.append(f'<circle cx="{x + d * 21}" cy="{y}" r="5" fill="#fff"/>')
        return ''.join(p)

    for parent, pk, child, col, end in links:
        px, _, _, pc = pos[parent]
        cx, _, _, cc = pos[child]
        sy, ty = row_y(parent, pk), row_y(child, col)
        kind = 'many' if end == 'ERzeroToMany' else 'zero-one'
        if pc == cc:                             # в одной колонке – петля слева
            gx = lane(('gap', pc), px - GAP_X + 30, 10)
            pts, sx, sd, tx, td = [(px, sy), (gx, sy), (gx, ty), (px, ty)], px, -1, px, -1
        else:
            right = cc > pc
            sx, sd = (px + W, 1) if right else (px, -1)
            tx, td = (cx, -1) if right else (cx + W, 1)
            g1 = lane(('gap', pc + (1 if right else 0)), (sx if right else sx - GAP_X) + 24, 9)
            g2 = lane(('gap', cc + (0 if right else 1)), (tx - GAP_X if right else tx) + 24, 9)
            if abs(cc - pc) == 1:                # соседние колонки – одна вертикаль в промежутке
                pts = [(sx, sy), (g1, sy), (g1, ty), (tx, ty)]
            else:                                # через колонку и дальше – по коридору над таблицами
                cy = lane('top', 34, -8)
                pts = [(sx, sy), (g1, sy), (g1, cy), (g2, cy), (g2, ty), (tx, ty)]
        d = 'M' + 'L'.join(f'{x} {y}' for x, y in pts)
        lines.append(f'<path d="{d}" fill="none"/>' + ends(sx, sy, sd, 'one') + ends(tx, ty, td, kind))

    for t, (x, y, h, _) in pos.items():
        pk = tables[t]['pk']
        out.append(f'<rect x="{x}" y="{y}" width="{W}" height="{h}" fill="#fff"/>')
        out.append(f'<text x="{x + W / 2}" y="{y + 20}" text-anchor="middle" font-weight="bold" font-size="13">{t}</text>')
        out.append(f'<path d="M{x} {y + HEAD}H{x + W}M{x + KEY_W} {y + HEAD}V{y + h}"/>')
        for i, c in enumerate(order[t]):
            ry = y + HEAD + ROW * i
            key = ','.join(k for k, ok in (('PK', c in pk), ('FK', c in tables[t]['fk'])) if ok)
            out.append(f'<text x="{x + KEY_W / 2}" y="{ry + 17}" text-anchor="middle" font-weight="bold" font-size="10">{key}</text>')
            style = ' font-weight="bold" text-decoration="underline"' if c in pk else ''
            out.append(f'<text x="{x + KEY_W + 8}" y="{ry + 17}"{style}>{c}</text>')
            nxt = order[t][i + 1] if i + 1 < len(order[t]) else None
            if c in pk and nxt and nxt not in pk:
                out.append(f'<path d="M{x} {ry + ROW}H{x + W}"/>')
    width = max(x + W for x, *_ in pos.values()) + 40
    height = max(y + h for _, y, h, _ in pos.values()) + 40
    top = 34 - 8 * used.get('top', 0) - 20
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top} {width} {height - top}" width="{width}" height="{height - top}" '
            f'font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#000" stroke="#000" stroke-width="1">'
            f'<rect x="0" y="{top}" width="{width}" height="{height - top}" fill="#fff" stroke="none"/>'
            f'<g stroke="#000">{"".join(lines)}</g><g>{"".join(out).replace("<text", "<text stroke=\"none\"")}</g></svg>')


if '--svg' in sys.argv:
    print(svg())
    sys.exit()

print('<mxfile host="drawio"><diagram name="Логическая схема БД «Рядом»" id="er">'
      '<mxGraphModel grid="1" gridSize="10" guides="1" page="0" math="0" shadow="0"><root>'
      '<mxCell id="0"/><mxCell id="1" parent="0"/>' + ''.join(cells) + '</root></mxGraphModel></diagram></mxfile>')
