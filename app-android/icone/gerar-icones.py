# Gera os ícones do app Android a partir de polvo.svg, usando o Chrome para desenhar.
# Uso (dentro de app-android/icone):  python3 gerar-icones.py
# Android 8+ usa ícone "adaptável": um fundo e uma frente separados (o celular recorta).
# Celulares mais antigos usam o ícone inteiro, quadrado (ic_launcher) e redondo (ic_launcher_round).
import os, re, subprocess, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(AQUI, "..", "android", "app", "src", "main", "res")
svg = open(os.path.join(AQUI, "polvo.svg"), encoding="utf-8").read()
svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)

# Variações do mesmo desenho
so_fundo = re.sub(r'<g id="polvo">.*</g>\s*</svg>', "</svg>", svg, flags=re.S)
so_polvo = svg.replace('fill="url(#g)"/>', 'fill="none"/>', 1)
def recortado(forma):  # ícone inteiro recortado (para celulares antigos), com o polvo mais perto
    return svg.replace('viewBox="0 0 108 108"', 'viewBox="15 15 78 78"', 1).replace("<rect id=\"fundo\"", f"<clipPath id=\"r\">{forma}</clipPath><g clip-path=\"url(#r)\"><rect id=\"fundo\"", 1).replace("</svg>", "</g></svg>")
quadrado = recortado('<rect x="15" y="15" width="78" height="78" rx="17"/>')
redondo = recortado('<circle cx="54" cy="54" r="39"/>')

def desenhar(conteudo, tamanho, destino):
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(conteudo.replace("<svg ", f'<svg width="{tamanho}" height="{tamanho}" ', 1))
    subprocess.run(["google-chrome", "--headless", "--disable-gpu", "--hide-scrollbars",
                    "--default-background-color=00000000", f"--window-size={tamanho},{tamanho}",
                    f"--screenshot={destino}", "file://" + f.name], check=True, capture_output=True)
    os.remove(f.name)

# densidade: (tamanho da camada adaptável, tamanho do ícone antigo)
for densidade, (camada, antigo) in {"mdpi": (108, 48), "hdpi": (162, 72), "xhdpi": (216, 96),
                                     "xxhdpi": (324, 144), "xxxhdpi": (432, 192)}.items():
    pasta = os.path.join(RES, "mipmap-" + densidade)
    desenhar(so_fundo, camada, os.path.join(pasta, "ic_launcher_background.png"))
    desenhar(so_polvo, camada, os.path.join(pasta, "ic_launcher_foreground.png"))
    desenhar(quadrado, antigo, os.path.join(pasta, "ic_launcher.png"))
    desenhar(redondo, antigo, os.path.join(pasta, "ic_launcher_round.png"))
    print("ok", densidade)

# ---------- Tela de abertura (splash) ----------
# Degradê na tela toda e o polvo no centro, em pé (port) e deitado (land).
polvo = re.search(r'<g id="polvo">.*</g>', svg, flags=re.S).group(0)  # do <g id="polvo"> até o último </g>
def abertura(largura, altura):
    lado = min(largura, altura) * 0.5  # o polvo ocupa metade do lado menor
    x, y = (largura - lado) / 2, (altura - lado) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {largura} {altura}">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3550D6"/>'
            '<stop offset="1" stop-color="#7A3FD1"/></linearGradient></defs>'
            f'<rect width="{largura}" height="{altura}" fill="url(#g)"/>'
            f'<g transform="translate({x} {y}) scale({lado / 108})">{polvo}</g></svg>')

def desenhar_retangulo(conteudo, largura, altura, destino):
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(conteudo.replace("<svg ", f'<svg width="{largura}" height="{altura}" ', 1))
    subprocess.run(["google-chrome", "--headless", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size={largura},{altura}", f"--screenshot={destino}", "file://" + f.name],
                   check=True, capture_output=True)
    os.remove(f.name)

for densidade, (curto, longo) in {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
                                   "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}.items():
    desenhar_retangulo(abertura(curto, longo), curto, longo, os.path.join(RES, f"drawable-port-{densidade}", "splash.png"))
    desenhar_retangulo(abertura(longo, curto), longo, curto, os.path.join(RES, f"drawable-land-{densidade}", "splash.png"))
    print("ok abertura", densidade)
desenhar_retangulo(abertura(480, 320), 480, 320, os.path.join(RES, "drawable", "splash.png"))
