"""
Música de fondo original (libre de derechos) para los videos de Tecnovigilancia HSDA.

Genera una pista suave tipo corporativo/ambiental: colchón de acordes, arpegio tipo piano,
bajo y percusión ligera, con la progresión I–V–vi–IV en Do mayor a 92 BPM.
La pista dura exactamente lo que se le pida y termina en el acorde de Do con desvanecido.

Uso:  python3 video/musica.py <segundos> <salida.wav>
Requiere numpy.
"""
import sys
import wave
import numpy as np

SR = 44100
BPM = 92
BEAT = 60 / BPM
BAR = 4 * BEAT

# Acordes (MIDI): Cmaj9, G6, Am7, Fmaj7
ACORDES = [
    [48, 55, 60, 64, 67, 74],
    [43, 55, 59, 62, 67, 71],
    [45, 57, 60, 64, 67, 72],
    [41, 57, 60, 64, 65, 69],
]
ARPEGIO = [0, 2, 3, 4, 5, 4, 3, 2]  # índices dentro del acorde, en corcheas


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def pad(freq, dur):
    t = np.arange(int(dur * SR)) / SR
    s = sum(np.sin(2 * np.pi * freq * d * t + p) for d, p in [(1, 0), (1.003, 1.1), (0.997, 2.3)])
    s += 0.15 * np.sin(2 * np.pi * 2 * freq * t)
    return s / 3 * env_adsr(len(t), 0.9, 1.2)


def pluck(freq, dur=0.9):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t) + 0.08 * np.sin(2 * np.pi * 3 * freq * t)
    e = np.exp(-t * 5.5) * np.minimum(1, t / 0.004)
    return s * e


def bass(freq, dur):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.2 * np.sin(2 * np.pi * 2 * freq * t)
    return s * np.exp(-t * 1.8) * np.minimum(1, t / 0.01)


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 50 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def shaker(rng):
    n = int(0.09 * SR)
    s = rng.standard_normal(n)
    s = s - np.concatenate([[0], s[:-1]])  # paso alto sencillo
    return s * np.exp(-np.arange(n) / SR * 45) * 0.5


def add(buf, sig, start, gain):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += gain * sig[: j - i]


def eco(x, delay, fb, mix):
    d = int(delay * SR)
    y = x.copy()
    for k in range(1, 5):
        y[d * k:] += x[: len(x) - d * k] * (fb ** k) * mix
    return y


def generar(dur):
    rng = np.random.default_rng(7)
    total = dur + 3
    pads, arp, low, perc = (np.zeros(int(total * SR)) for _ in range(4))
    nbars = int(np.ceil(dur / BAR))
    for b in range(nbars):
        t0 = b * BAR
        ch = ACORDES[b % 4]
        final = b == nbars - 1
        if final:
            ch = ACORDES[0]
        for m in ch[1:]:
            add(pads, pad(hz(m), BAR + 1.2), t0, 0.10)
        if b >= 1:
            for k, idx in enumerate(ARPEGIO if not final else ARPEGIO[:1]):
                add(arp, pluck(hz(ch[idx] + 12)), t0 + k * BEAT / 2, 0.16 if k % 2 == 0 else 0.11)
        if b >= 2:
            add(low, bass(hz(ch[0] - 12 if ch[0] > 45 else ch[0]), 2 * BEAT), t0, 0.45)
            if not final:
                add(low, bass(hz(ch[0] - 12 if ch[0] > 45 else ch[0]), 2 * BEAT), t0 + 2 * BEAT, 0.35)
        if 3 <= b and not final:
            for k in (0, 2):
                add(perc, kick(), t0 + k * BEAT, 0.35)
            for k in range(8):
                add(perc, shaker(rng), t0 + k * BEAT / 2, 0.025 if k % 2 == 0 else 0.045)
    mix = pads + eco(arp, 0.75 * BEAT, 0.45, 0.6) + low + perc
    mix = mix[: int(dur * SR)]
    # Entrada y salida suaves
    fi, fo = int(1.5 * SR), int(min(4, dur / 4) * SR)
    mix[:fi] *= np.linspace(0, 1, fi)
    mix[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix * 0.89


def guardar(x, out):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    est = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(est.tobytes())


if __name__ == '__main__':
    guardar(generar(float(sys.argv[1])), sys.argv[2])
