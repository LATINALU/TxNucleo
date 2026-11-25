"""Validadores de los contratos de la red TxNucleo (HojaSprites, Modelo3D, ContratoEstilo, ManifiestoRecursos).

Equivalentes a src/enlaces/contratos.ts: devuelven la lista de errores (vacía = válido). Se verifican contra
vectores/contratos.json, así un pipeline en Python (Blender, herramientas de arte, servidores) valida igual que TS.
"""
import math
import re

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
SHA = re.compile(r"^[0-9a-f]{64}$")
TIPOS = ("sprites", "modelo3d", "imagen", "audio", "estilo", "otro")


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _texto(v):
    return isinstance(v, str) and len(v) > 0


def _v3(v):
    return isinstance(v, list) and len(v) == 3 and all(_num(x) for x in v)


def ruta_segura(r):
    """Ruta relativa que no sale de la carpeta del juego."""
    if not _texto(r):
        return False
    n = r.replace("\\", "/")
    return not n.startswith("/") and not re.match(r"^[a-zA-Z]:", n) and ".." not in n.split("/")


def _origen(o, ruta, e):
    if not isinstance(o, dict) or not _texto(o.get("herramienta")):
        e.append(ruta + ".herramienta: falta")
    elif "fuenteSha256" in o and not (isinstance(o["fuenteSha256"], str) and SHA.match(o["fuenteSha256"])):
        e.append(ruta + ".fuenteSha256: 64 hex")


def validar_hoja(h):
    """Valida una HojaSprites."""
    if not isinstance(h, dict):
        return ["la hoja no es un objeto"]
    e = []
    if h.get("version") != "txnucleo.hoja.v1":
        e.append("version")
    if not ruta_segura(h.get("imagen")):
        e.append("imagen")
    ancho, alto = h.get("ancho"), h.get("alto")
    if not (_num(ancho) and ancho > 0 and _num(alto) and alto > 0):
        e.append("ancho/alto")
    cuadros = h.get("cuadros") if isinstance(h.get("cuadros"), list) else []
    if not cuadros:
        e.append("cuadros")
    nombres = set()
    for i, c in enumerate(cuadros):
        if not isinstance(c, dict) or not _texto(c.get("nombre")):
            e.append("cuadros[%d]" % i)
            continue
        if c["nombre"] in nombres:
            e.append("cuadros[%d]: repetido" % i)
        nombres.add(c["nombre"])
        xs = [c.get(k) for k in ("x", "y", "w", "h")]
        if not all(_num(v) for v in xs):
            e.append("cuadros[%d]: x/y/w/h" % i)
            continue
        x, y, w, hh = xs
        if w <= 0 or hh <= 0 or x < 0 or y < 0:
            e.append("cuadros[%d]: tamaño" % i)
        elif _num(ancho) and _num(alto) and (x + w > ancho or y + hh > alto):
            e.append("cuadros[%d]: se sale" % i)
    anims = h.get("animaciones")
    if not isinstance(anims, list):
        e.append("animaciones")
        anims = []
    for i, a in enumerate(anims):
        if not isinstance(a, dict) or not _texto(a.get("nombre")) or not _num(a.get("desde")) or not _num(a.get("hasta")):
            e.append("animaciones[%d]" % i)
            continue
        if a["desde"] < 0 or a["hasta"] < a["desde"] or a["hasta"] >= len(cuadros):
            e.append("animaciones[%d]: tramo" % i)
        ms = a.get("ms")
        if not isinstance(ms, list) or len(ms) != a["hasta"] - a["desde"] + 1 or not all(_num(m) and m > 0 for m in ms):
            e.append("animaciones[%d]: ms" % i)
    p = h.get("pivote")
    if not isinstance(p, list) or len(p) != 2 or not all(_num(v) for v in p):
        e.append("pivote")
    _origen(h.get("origen"), "origen", e)
    return e


def validar_modelo3d(m):
    """Valida un Modelo3D."""
    if not isinstance(m, dict):
        return ["el modelo no es un objeto"]
    e = []
    if m.get("version") != "txnucleo.modelo3d.v1":
        e.append("version")
    glb = m.get("glb")
    if not ruta_segura(glb) or not str(glb).lower().endswith(".glb"):
        e.append("glb")
    if not _num(m.get("bytes")) or m["bytes"] <= 0:
        e.append("bytes")
    if "sha256" in m and not (isinstance(m["sha256"], str) and SHA.match(m["sha256"])):
        e.append("sha256")
    c = m.get("caja")
    if not isinstance(c, dict) or not all(_v3(c.get(k)) for k in ("min", "max", "tamano", "centro")):
        e.append("caja")
    elif any(a > b for a, b in zip(c["min"], c["max"])):
        e.append("caja: min > max")
    if not _num(m.get("triangulos")) or m["triangulos"] < 0:
        e.append("triangulos")
    if not isinstance(m.get("nodos"), list):
        e.append("nodos")
    col = m.get("colision")
    if not isinstance(col, dict) or col.get("forma") not in ("caja", "capsula", "esfera"):
        e.append("colision")
    if m.get("qa") not in ("aprobado", "rechazado", "desconocido"):
        e.append("qa")
    if not isinstance(m.get("etiquetas"), list):
        e.append("etiquetas")
    _origen(m.get("origen"), "origen", e)
    return e


def validar_estilo(s):
    """Valida un ContratoEstilo."""
    if not isinstance(s, dict):
        return ["el estilo no es un objeto"]
    e = []
    if s.get("version") != "txnucleo.estilo.v1":
        e.append("version")
    if not _texto(s.get("nombre")):
        e.append("nombre")
    pal = s.get("paleta") if isinstance(s.get("paleta"), list) else []
    if not pal:
        e.append("paleta")
    roles = set()
    for i, c in enumerate(pal):
        if not isinstance(c, dict) or not _texto(c.get("rol")) or not isinstance(c.get("hex"), str) or not HEX.match(c["hex"]) or not _v3(c.get("oklab")):
            e.append("paleta[%d]" % i)
            continue
        if c["rol"] in roles:
            e.append("paleta[%d]: rol repetido" % i)
        roles.add(c["rol"])
    if "pixel" in s:
        p = s["pixel"]
        ok = isinstance(p, dict) and isinstance(p.get("resolucion"), list) and all(_num(v) and v > 0 for v in p["resolucion"])
        esc = p.get("escala") if isinstance(p, dict) else None
        if not ok or not _num(esc) or esc < 1 or esc != int(esc):
            e.append("pixel")
    if not isinstance(s.get("referencias"), list):
        e.append("referencias")
    return e


def validar_manifiesto(m):
    """Valida un ManifiestoRecursos."""
    if not isinstance(m, dict):
        return ["el manifiesto no es un objeto"]
    e = []
    if m.get("version") != "txnucleo.recursos.v1":
        e.append("version")
    rs = m.get("recursos")
    if not isinstance(rs, list):
        e.append("recursos")
        rs = []
    rutas = set()
    for i, r in enumerate(rs):
        if not isinstance(r, dict):
            e.append("recursos[%d]" % i)
            continue
        if not ruta_segura(r.get("ruta")):
            e.append("recursos[%d].ruta" % i)
        elif r["ruta"] in rutas:
            e.append("recursos[%d].ruta: repetida" % i)
        else:
            rutas.add(r["ruta"])
        if r.get("tipo") not in TIPOS:
            e.append("recursos[%d].tipo" % i)
        if not isinstance(r.get("sha256"), str) or not SHA.match(r["sha256"]):
            e.append("recursos[%d].sha256" % i)
        if not _texto(r.get("licencia")):
            e.append("recursos[%d].licencia" % i)
        _origen(r.get("origen"), "recursos[%d].origen" % i, e)
    return e


VALIDADORES = {"hoja": validar_hoja, "modelo3d": validar_modelo3d, "estilo": validar_estilo, "recursos": validar_manifiesto}
