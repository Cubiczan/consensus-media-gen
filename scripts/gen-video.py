import subprocess, os, sys

SCREENSHOTS = "/home/z/my-project/download/screenshots"
OUTPUT = "/home/z/my-project/download/demo-media"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H = 1280, 720

def make_card_png(filename, lines, bg="0x13131a"):
    filters = []
    y_start = H // 2 - 40 - (len(lines) - 1) * 25
    for i, (text, size, color, font) in enumerate(lines):
        y = y_start + i * 50
        f = FONT_B if font == "bold" else FONT_R
        filters.append(f"drawtext=fontfile={f}:text='{text}':fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}")
    vf = ",".join(filters)
    out = os.path.join(OUTPUT, filename)
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={bg}:s={W}x{H}:d=1:r=1",
        "-vf", vf, "-frames:v", "1", "-update", "1", out
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"ERR {filename}: {r.stderr[-200:]}")
        return None
    return out

def resize_screenshot(src, outname):
    out = os.path.join(OUTPUT, outname)
    cmd = ["ffmpeg", "-y", "-i", src, "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:0x000000", "-frames:v", "1", "-update", "1", out]
    subprocess.run(cmd, capture_output=True, check=True)
    return out

print(f"Resolution: {W}x{H}")

# Generate card PNGs
cards = [
    ("card-title.png", [("CVMG", 64, "0x10b981", "bold"), ("Consensus-Verified Media Generator", 24, "0xffffff", "regular"), ("Backblaze Generative Media Hackathon 2026", 18, "0xa1a1aa", "regular"), ("Multi-Model AI Generation  -  Backblaze B2 Storage  -  Genblaze SDK", 14, "0x52525b", "regular")]),
    ("card-sec1.png", [("1. Generation Studio", 40, "0x10b981", "bold"), ("Write prompts and select AI models for consensus generation", 18, "0xa1a1aa", "regular")]),
    ("card-sec2.png", [("2. Multi-Model Generation", 40, "0xf59e0b", "bold"), ("Multiple models generate concurrently via Genblaze SDK", 18, "0xa1a1aa", "regular")]),
    ("card-sec3.png", [("3. Gallery and Results", 40, "0x8b5cf6", "bold"), ("Browse generations with consensus scores", 18, "0xa1a1aa", "regular")]),
    ("card-sec4.png", [("4. Pipeline Inspector", 40, "0x06b6d4", "bold"), ("State machine timeline and candidate comparison", 18, "0xa1a1aa", "regular")]),
    ("card-sec5.png", [("5. B2 Cloud Storage", 40, "0x14b8a6", "bold"), ("All assets on Backblaze B2 with full provenance", 18, "0xa1a1aa", "regular")]),
    ("card-feat1.png", [("Consensus State Machine", 38, "0x10b981", "bold"), ("PENDING > GENERATING > VALIDATING > ADVERSARIAL_CHECK > SELECTING > STORING > COMPLETED", 15, "0xa1a1aa", "regular")]),
    ("card-feat2.png", [("Scoring Algorithm", 38, "0xf59e0b", "bold"), ("50% Quality + 30% Diversity + 20% Adversarial = Consensus Score", 17, "0xa1a1aa", "regular")]),
    ("card-feat3.png", [("B2 S3 Operations", 38, "0x14b8a6", "bold"), ("PutObject  GetObject  ListObjects  HeadObject  GetSignedUrl", 16, "0xa1a1aa", "regular")]),
    ("card-feat4.png", [("Genblaze SDK Pattern", 38, "0x8b5cf6", "bold"), ("Pipeline + Context + Node for multi-model orchestration", 17, "0xa1a1aa", "regular")]),
    ("card-feat5.png", [("Hackathon Criteria", 38, "0xffffff", "bold"), ("Real-World Utility  -  Production Ready  -  B2 Storage  -  Genblaze Use", 17, "0xa1a1aa", "regular")]),
    ("card-end.png", [("CVMG", 56, "0x10b981", "bold"), ("Consensus-Verified Media Generator", 22, "0xffffff", "regular"), ("Backblaze Generative Media Hackathon 2026", 16, "0x52525b", "regular")]),
]

print("Generating cards...")
for fname, lines in cards:
    result = make_card_png(fname, lines)
    if result:
        print(f"  OK {fname}")
    else:
        sys.exit(1)

print("Resizing screenshots...")
for ss in ["01-studio.png", "02-studio-filled.png", "03-gallery.png", "04-inspector.png", "05-b2-storage.png"]:
    resize_screenshot(os.path.join(SCREENSHOTS, ss), f"ss-{ss}")
    print(f"  OK ss-{ss}")

# Build concat file
# Sequence: ~180 seconds
sequence = [
    ("card-title.png", 15),
    ("card-sec1.png", 7), ("ss-02-studio-filled.png", 20), ("ss-01-studio.png", 18),
    ("card-sec2.png", 7), ("ss-02-studio-filled.png", 16),
    ("card-sec3.png", 7), ("ss-03-gallery.png", 18),
    ("card-sec4.png", 7), ("ss-04-inspector.png", 16),
    ("card-sec5.png", 7), ("ss-05-b2-storage.png", 18),
    ("card-feat1.png", 10), ("card-feat2.png", 10), ("card-feat3.png", 10), ("card-feat4.png", 10), ("card-feat5.png", 10),
    ("card-sec5.png", 7), ("ss-01-studio.png", 12), ("ss-05-b2-storage.png", 10),
    ("card-end.png", 15),
]

concat_path = os.path.join(OUTPUT, "concat.txt")
total = 0
with open(concat_path, "w") as f:
    for fname, dur in sequence:
        f.write(f"file '{os.path.join(OUTPUT, fname)}'\n")
        f.write(f"duration {dur}\n")
        total += dur
print(f"\nPlanned duration: {total}s ({total/60:.1f} min)")

# Assemble video
print("Assembling video...")
final = os.path.join(OUTPUT, "cvmg-demo.mp4")
cmd = [
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path,
    "-vf", "fps=24,format=yuv420p",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
    "-movflags", "+faststart", final
]
result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
if result.returncode != 0:
    print(f"ERR: {result.stderr[-300:]}")
    sys.exit(1)

probe = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration,size", "-of", "csv=p=0", final],
    capture_output=True, text=True
)
parts = probe.stdout.strip().split(",")
print(f"\nDone! {float(parts[0]):.1f}s ({float(parts[0])/60:.1f} min) | {int(parts[1])/1024/1024:.1f} MB")
print(f"Output: {final}")