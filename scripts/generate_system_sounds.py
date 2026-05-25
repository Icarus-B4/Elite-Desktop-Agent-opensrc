import os
import wave
import math
import struct

def write_wav(filename, samples, sample_rate=44100):
    """Schreibt ein Array von Float-Samples (-1.0 bis 1.0) als 16-Bit Mono PCM WAV-Datei."""
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with wave.open(filename, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        
        packed_data = b''
        for s in samples:
            s = max(-1.0, min(1.0, s))
            val = int(s * 32767)
            packed_data += struct.pack('<h', val)
        w.writeframes(packed_data)
    print(f"Generiert: {filename} ({len(samples)} Samples)")

def generate_startup(sample_rate=44100):
    """Erzeugt einen Jarvis-artigen Systemstart-Sound:
    Eine ansteigende Cyber-Swoop Frequenz (100Hz -> 650Hz) gefolgt von zwei hellen, digitalen Chimes.
    """
    duration = 2.2  # Sekunden
    num_samples = int(duration * sample_rate)
    samples = [0.0] * num_samples
    
    # 1. Rising Sweep (0.0s bis 1.2s)
    sweep_duration = 1.2
    sweep_samples = int(sweep_duration * sample_rate)
    for i in range(sweep_samples):
        t = i / sample_rate
        # Exponentieller/Quadratischer Frequenzanstieg von 100Hz bis 700Hz
        freq = 100.0 + 600.0 * (t / sweep_duration) ** 2
        # Phase integrieren: integral von f(t) dt = 100*t + 600 * t^3 / (3 * sweep_duration^2)
        phase = 2.0 * math.pi * (100.0 * t + (600.0 * t**3) / (3.0 * sweep_duration**2))
        
        # Grundwelle + Oberschwingungen für metallischen Charakter
        val = 0.5 * math.sin(phase) + 0.25 * math.sin(phase * 2) + 0.1 * math.sin(phase * 3)
        
        # Ein- und Ausblenden des Sweeps
        envelope = math.sin(math.pi * (t / sweep_duration))  # Bogenförmig
        samples[i] += val * envelope * 0.4
        
    # 2. Digital Chime 1 (Start bei 1.1s)
    chime1_start = 1.1
    chime1_freq = 880.0  # A5
    chime1_samples = int((duration - chime1_start) * sample_rate)
    for i in range(chime1_samples):
        t = i / sample_rate
        val = 0.6 * math.sin(2.0 * math.pi * chime1_freq * t) + 0.15 * math.sin(2.0 * math.pi * chime1_freq * 2 * t)
        envelope = math.exp(-6.0 * t)  # Schneller Abfall
        samples[int(chime1_start * sample_rate) + i] += val * envelope * 0.5
        
    # 3. Digital Chime 2 (Start bei 1.25s)
    chime2_start = 1.25
    chime2_freq = 1318.51  # E6
    chime2_samples = int((duration - chime2_start) * sample_rate)
    for i in range(chime2_samples):
        t = i / sample_rate
        val = 0.6 * math.sin(2.0 * math.pi * chime2_freq * t) + 0.2 * math.sin(2.0 * math.pi * chime2_freq * 1.5 * t)
        envelope = math.exp(-3.5 * t)  # Weicherer Abfall
        samples[int(chime2_start * sample_rate) + i] += val * envelope * 0.5
        
    return samples

def generate_shutdown(sample_rate=44100):
    """Erzeugt einen absteigenden Swoop für das Schließen (Ausschalten)."""
    duration = 1.2
    num_samples = int(duration * sample_rate)
    samples = [0.0] * num_samples
    
    for i in range(num_samples):
        t = i / sample_rate
        # Absteigender Glide von 750Hz auf 150Hz
        freq = 750.0 - 600.0 * (t / duration) ** 1.5
        # Phase integrieren: integral von f(t) dt = 750*t - (600 / 2.5) * t^2.5
        phase = 2.0 * math.pi * (750.0 * t - (600.0 / 2.5) * (t**2.5) / (duration**1.5))
        
        val = 0.6 * math.sin(phase) + 0.2 * math.sin(phase * 1.5)
        # Weiches Ausblenden
        envelope = 1.0 - (t / duration)
        samples[i] = val * envelope * 0.4

    return samples

def generate_task_completed(sample_rate=44100):
    """Heller, zweifacher Erfolgs-Chime ("Ding-Ding")."""
    duration = 1.0
    num_samples = int(duration * sample_rate)
    samples = [0.0] * num_samples
    
    # Erste Note (G5, 783.99 Hz, Start bei 0.0s)
    freq1 = 783.99
    len1 = int(0.5 * sample_rate)
    for i in range(len1):
        t = i / sample_rate
        val = 0.5 * math.sin(2.0 * math.pi * freq1 * t) + 0.15 * math.sin(2.0 * math.pi * freq1 * 2 * t)
        envelope = math.exp(-12.0 * t)
        samples[i] += val * envelope * 0.4
        
    # Zweite Note (C6, 1046.50 Hz, Start bei 0.12s)
    freq2 = 1046.50
    start2 = int(0.12 * sample_rate)
    len2 = num_samples - start2
    for i in range(len2):
        t = i / sample_rate
        val = 0.5 * math.sin(2.0 * math.pi * freq2 * t) + 0.2 * math.sin(2.0 * math.pi * freq2 * 1.5 * t)
        envelope = math.exp(-5.0 * t)
        samples[start2 + i] += val * envelope * 0.4
        
    return samples

def generate_timer(sample_rate=44100):
    """Rhythmischer Warnton (3 schnelle Pulse)."""
    duration = 0.8
    num_samples = int(duration * sample_rate)
    samples = [0.0] * num_samples
    
    pulse_freq = 987.77  # H5 (B5)
    pulse_len = int(0.12 * sample_rate)
    offsets = [0, int(0.22 * sample_rate), int(0.44 * sample_rate)]
    
    for start in offsets:
        for i in range(pulse_len):
            t = i / sample_rate
            val = 0.6 * math.sin(2.0 * math.pi * pulse_freq * t)
            # Schnelles Ein- und Ausblenden pro Puls
            envelope = math.sin(math.pi * (t / (pulse_len / sample_rate)))
            samples[start + i] += val * envelope * 0.35
            
    return samples

def generate_click(sample_rate=44100):
    """Subtiler, extrem kurzer Tick für Klicks."""
    duration = 0.04
    num_samples = int(duration * sample_rate)
    samples = [0.0] * num_samples
    
    click_freq = 1800.0
    for i in range(num_samples):
        t = i / sample_rate
        val = math.sin(2.0 * math.pi * click_freq * t)
        # Extrem schneller exponentieller Abfall (perkussiver Klick)
        envelope = math.exp(-150.0 * t)
        samples[i] = val * envelope * 0.3
        
    return samples

def main():
    dest_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "sounds"))
    print(f"Zielverzeichnis: {dest_dir}")
    
    write_wav(os.path.join(dest_dir, "startup.wav"), generate_startup())
    write_wav(os.path.join(dest_dir, "shutdown.wav"), generate_shutdown())
    write_wav(os.path.join(dest_dir, "task_completed.wav"), generate_task_completed())
    write_wav(os.path.join(dest_dir, "timer.wav"), generate_timer())
    write_wav(os.path.join(dest_dir, "click.wav"), generate_click())
    print("Alle System-Sounds wurden erfolgreich generiert.")

if __name__ == "__main__":
    main()
