# Диаграмма вариантов использования (UML) веб-приложения «Рядом» по заданию на курсовой проект.
# Общие для клиента и психолога варианты вынесены в обобщённого актора «Пользователь» (наследование UML),
# поэтому к каждому варианту идёт одна линия. Варианты каждого актора лежат дугой к нему – линии не пересекаются.
# Запуск из корня: python3 tools/use-case.py > docs/use-case.drawio
#                 python3 tools/use-case.py --svg > docs/use-case.svg
import math
import sys
from xml.sax.saxutils import escape

CLIENT, PSY, MOD, USER = 'Клиент', 'Психолог', 'Модератор', 'Пользователь'

# Варианты использования: текст (\n – перенос строки) и акторы, которые с ним связаны
CASES = [
    # клиент
    ('Заполнение и редактирование\nличного профиля', [CLIENT]),
    ('Поиск и просмотр\nпрофилей психологов', [CLIENT]),
    ('Подбор психолога\nпо анкете', [CLIENT]),
    ('Просмотр расписания\nпсихолога', [CLIENT]),
    ('Запись на сессию', [CLIENT]),
    ('Просмотр истории\nконсультаций', [CLIENT]),
    ('Публикация отзыва\nи оценки', [CLIENT]),
    # психолог
    ('Создание и редактирование\nпрофессионального профиля', [PSY]),
    ('Удаление профиля', [PSY]),
    ('Загрузка документов\nоб образовании', [PSY]),
    ('Управление свободными\nслотами расписания', [PSY]),
    ('Просмотр записей\nклиентов', [PSY]),
    ('Просмотр отзывов', [PSY]),
    # общие: через «Пользователя» – и для клиента, и для психолога
    ('Регистрация', [USER]),
    ('Переписка в чате', [USER]),
    ('Отмена или перенос записи\nс указанием причины', [USER]),
    ('Авторизация', [USER, MOD]),
    # модератор
    ('Управление\nпользователями', [MOD]),
    ('Блокировка и разблокировка\nаккаунтов', [MOD]),
    ('Проверка документов\nи подтверждение статуса', [MOD]),
    ('Модерация отзывов', [MOD]),
    ('Назначение ролей\nи прав доступа', [MOD]),
    ('Просмотр журнала\nдействий', [MOD]),
]

EW, EH = 230, 64                                   # размер эллипса
ACTORS = {CLIENT: (100, 400), USER: (100, 830), PSY: (100, 1260), MOD: (1660, 830)}   # точка, откуда идут линии (плечи)
INHERITS = [(CLIENT, USER), (PSY, USER)]          # обобщение: клиент и психолог – пользователи
BOX = (190, 30, 1560, 1620)                        # граница системы: x1, y1, x2, y2


def arc(actor, names, radius, a_from, a_to):
    """Расставить варианты дугой вокруг актора (углы в градусах, 0 – вправо, по часовой – вниз)"""
    ax, ay = ACTORS[actor]
    n = len(names)
    out = {}
    for i, name in enumerate(names):
        a = math.radians(a_from + (a_to - a_from) * (i / (n - 1) if n > 1 else .5))
        out[name] = (ax + radius * math.cos(a), ay + radius * math.sin(a))
    return out


own = lambda who: [t for t, a in CASES if a == [who]]
pos = {}
pos.update(arc(CLIENT, own(CLIENT), 520, -36, 22))
pos.update(arc(PSY, own(PSY), 520, -22, 36))
# у «Пользователя» посередине проход для линии к «Авторизации» – она в центре, к ней же идёт модератор
user = [t for t, a in CASES if a == [USER]]
pos.update(arc(USER, user[:2], 430, -20, -9))
pos.update(arc(USER, user[2:], 430, 13, 13))
pos['Авторизация'] = (880, 830)
mod = own(MOD)
pos.update(arc(MOD, mod[:3], 470, 140, 166))
pos.update(arc(MOD, mod[3:], 470, 194, 220))

shared = [t for t, a in CASES if len(a) > 1]


def inside(px, py, cx, cy, pad=6):
    return ((px - cx) / (EW / 2 + pad)) ** 2 + ((py - cy) / (EH / 2 + pad)) ** 2 < 1


def crossings():
    """Сколько линий проходит через чужие эллипсы плюс эллипсы, налезающие друг на друга (для проверки раскладки)"""
    bad = 0
    for text, actors in CASES:
        tx, ty = pos[text]
        for actor in actors:
            ax, ay = ACTORS[actor]
            for other, (ox, oy) in pos.items():
                if other != text and any(inside(ax + (tx - ax) * k / 60, ay + (ty - ay) * k / 60, ox, oy) for k in range(1, 58)):
                    bad += 1
    names = list(pos)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            (x1, y1), (x2, y2) = pos[names[i]], pos[names[j]]
            if abs(x1 - x2) < EW + 10 and abs(y1 - y2) < EH + 8:
                bad += 1
    return bad


print(f'пересечений: {crossings()}', file=sys.stderr)


def edge_point(ax, ay, cx, cy):
    """Точка на границе эллипса по направлению к актору – линия упирается в эллипс, а не в центр"""
    dx, dy = ax - cx, ay - cy
    k = 1 / math.sqrt((dx / (EW / 2)) ** 2 + (dy / (EH / 2)) ** 2)
    return cx + dx * k, cy + dy * k


def actor_svg(name, x, y):
    # человечек: голова, тело, руки, ноги; (x, y) – уровень плеч
    return (f'<circle cx="{x}" cy="{y - 22}" r="11" fill="#fff"/>'
            f'<path d="M{x} {y - 11}V{y + 22}M{x - 20} {y}H{x + 20}M{x} {y + 22}L{x - 16} {y + 50}M{x} {y + 22}L{x + 16} {y + 50}" fill="none"/>'
            f'<text x="{x}" y="{y + 72}" text-anchor="middle" stroke="none">{name}</text>')


def svg():
    x1, y1, x2, y2 = BOX
    out = [f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" fill="#fff"/>',
           f'<text x="{(x1 + x2) / 2}" y="{y1 + 28}" text-anchor="middle" font-weight="bold" stroke="none">Веб-приложение «Рядом»</text>']
    for text, actors in CASES:
        cx, cy = pos[text]
        for actor in actors:
            ax, ay = ACTORS[actor]
            ex, ey = edge_point(ax, ay, cx, cy)
            out.append(f'<path d="M{ax + (12 if ex > ax else -12)} {ay}L{ex:.1f} {ey:.1f}" fill="none"/>')
    for text, _ in CASES:
        cx, cy = pos[text]
        out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{EW / 2}" ry="{EH / 2}" fill="#fff"/>')
        lines = text.split('\n')
        for i, line in enumerate(lines):
            ty = cy + 5 + (i - (len(lines) - 1) / 2) * 17
            out.append(f'<text x="{cx}" y="{ty:.1f}" text-anchor="middle" stroke="none">{escape(line)}</text>')
    for name, (x, y) in ACTORS.items():
        out.append(actor_svg(name, x, y))
    for child, parent in INHERITS:              # линия к родителю с полым треугольником на конце
        (cx, cy), (px, py) = ACTORS[child], ACTORS[parent]
        down = py > cy
        ya, yb = (cy + 82, py - 40) if down else (cy - 40, py + 82)
        t = -14 if down else 14
        out.append(f'<path d="M{cx} {ya}V{yb + t}" fill="none"/><path d="M{px} {yb}L{px - 9} {yb + t}H{px + 9}Z" fill="#fff"/>')
    w, h = 1760, y2 + 40
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#000" stroke="#000" stroke-width="1">'
            f'<rect width="{w}" height="{h}" fill="#fff" stroke="none"/>{"".join(out)}</svg>')


def drawio():
    cells, n = [], [1]

    def cid():
        n[0] += 1
        return f'u{n[0]}'

    x1, y1, x2, y2 = BOX
    cells.append(f'<mxCell id="{cid()}" value="Веб-приложение «Рядом»" style="rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;fontStyle=1;fontFamily=Arial;fontSize=14;fillColor=none;" vertex="1" parent="1">'
                 f'<mxGeometry x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" as="geometry"/></mxCell>')
    ids = {}
    for name, (x, y) in ACTORS.items():
        ids[name] = cid()
        cells.append(f'<mxCell id="{ids[name]}" value="{name}" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;fontFamily=Arial;fontSize=14;" vertex="1" parent="1">'
                     f'<mxGeometry x="{x - 20}" y="{y - 33}" width="40" height="83" as="geometry"/></mxCell>')
    for text, _ in CASES:
        cx, cy = pos[text]
        ids[text] = cid()
        cells.append(f'<mxCell id="{ids[text]}" value="{escape(text).replace(chr(10), "&lt;br&gt;")}" style="ellipse;whiteSpace=wrap;html=1;fontFamily=Arial;fontSize=13;" vertex="1" parent="1">'
                     f'<mxGeometry x="{cx - EW / 2}" y="{cy - EH / 2}" width="{EW}" height="{EH}" as="geometry"/></mxCell>')
    for text, actors in CASES:
        for actor in actors:
            cells.append(f'<mxCell id="{cid()}" style="endArrow=none;html=1;rounded=0;" edge="1" parent="1" source="{ids[actor]}" target="{ids[text]}">'
                         f'<mxGeometry relative="1" as="geometry"/></mxCell>')
    for child, parent in INHERITS:
        cells.append(f'<mxCell id="{cid()}" style="endArrow=block;endFill=0;endSize=14;html=1;rounded=0;" edge="1" parent="1" source="{ids[child]}" target="{ids[parent]}">'
                     f'<mxGeometry relative="1" as="geometry"/></mxCell>')
    return ('<mxfile host="drawio"><diagram name="Диаграмма вариантов использования" id="uc"><mxGraphModel grid="1" gridSize="10" page="0"><root>'
            '<mxCell id="0"/><mxCell id="1" parent="0"/>' + ''.join(cells) + '</root></mxGraphModel></diagram></mxfile>')


print(svg() if '--svg' in sys.argv else drawio())
