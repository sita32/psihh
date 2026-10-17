# Логическая схема БД «Рядом» в формате mermaid: таблицы и поля из schema.sql, связи – из README.md.
# Запуск из корня: python3 tools/er-diagram.py database/schema.sql database/README.md > database/er-diagram.mmd
import re, sys
sql = open(sys.argv[1]).read()
readme = open(sys.argv[2]).read()
skip = ('CONSTRAINT', 'FOREIGN', 'REFERENCES', 'ON ', 'WITH', 'WHERE', 'USING', 'CHECK', 'PRIMARY', 'UNIQUE', 'EXCLUDE', '--', ')')
out = ['erDiagram']
for m in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);', sql, re.S):
    name, body = m.group(1), m.group(2)
    pk_tbl, fk_tbl = set(), set()
    for c in re.findall(r'PRIMARY KEY \(([^)]*)\)', body): pk_tbl |= {x.strip() for x in c.split(',')}
    for c in re.findall(r'FOREIGN KEY \(([^)]*)\)', body): fk_tbl |= {x.strip() for x in c.split(',')}
    cols = []
    for line in body.split('\n'):
        line = line.strip().rstrip(',')
        if not line or line.startswith(skip): continue
        mm = re.match(r'(\w+)\s+(\w+)', line)
        if not mm: continue
        col, typ = mm.groups()
        if typ.isupper(): continue   # строки ограничений (EXCLUDE ... WITH =), а не поля
        keys = []
        if 'PRIMARY KEY' in line or col in pk_tbl: keys.append('PK')
        if 'REFERENCES' in line or col in fk_tbl: keys.append('FK')
        if re.search(r'\bUNIQUE\b', line) and 'PK' not in keys: keys.append('UK')
        cols.append(f'        {typ} {col}' + (f' {",".join(keys)}' if keys else ''))
    out.append(f'    {name} {{'); out += cols; out.append('    }')
rels = re.search(r'```mermaid\nerDiagram\n(.*?)```', readme, re.S).group(1)
RU = {'has': 'имеет', 'overrides': 'доп. права', 'blocked': 'блокировки', 'offers': 'оказывает', 'uploads': 'загружает',
      'confirms': 'подтверждает', 'submits': 'подаёт заявку', 'opens': 'открывает', 'books': 'записывается',
      'rescheduled_from': 'перенос', 'sends': 'отправляет', 'receives': 'получает', 'performs': 'выполняет'}
for l in rels.split('\n'):
    if not l.strip(): continue
    head, _, label = l.rpartition(' : ')
    label = RU.get(label.strip().strip('"'), label.strip().strip('"'))
    out.append(f'{head} : "{label}"')
print('\n'.join(out))
