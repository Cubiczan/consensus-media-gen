#!/bin/bash
# Generate a 3-minute CVMG demo video from screenshots using FFmpeg
set -e

SCREENSHOTS="/home/z/my-project/download/screenshots"
OUTPUT="/home/z/my-project/download/demo-media"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Get screenshot dimensions
W=$(identify -format "%w" "${SCREENSHOTS}/01-studio.png" 2>/dev/null || echo "1920")
H=$(identify -format "%h" "${SCREENSHOTS}/01-studio.png" 2>/dev/null || echo "1080")

echo "Resolution: ${W}x${H}"

# Step 1: Create title card (black bg with text) - 15 seconds
ffmpeg -y -f lavfi -i color=c=0x0d0d12:s=${W}x${H}:d=15:r=30 \
  -vf "drawtext=fontfile=${FONT}:text='CVMG':fontsize=72:fontcolor=0x10b981:x=(w-text_w)/2:y=(h/2)-80,drawtext=fontfile=${FONT_REG}:text='Consensus-Verified Media Generator':fontsize=28:fontcolor=0xa1a1aa:x=(w-text_w)/2:y=(h/2)+10,drawtext=fontfile=${FONT_REG}:text='Backblaze Generative Media Hackathon 2026':fontsize=20:fontcolor=0x71717a:x=(w-text_w)/2:y=(h/2)+55,drawtext=fontfile=${FONT_REG}:text='Multi-Model AI Generation  |  Backblaze B2 Storage  |  Genblaze SDK':fontsize=16:fontcolor=0x52525b:x=(w-text_w)/2:y=(h/2)+100" \
  -c:v libx264 -pix_fmt yuv420p -t 15 "${OUTPUT}/title.png" 2>/dev/null

echo "Step 1: Title card done"

# Step 2: Create section header generator function
create_section_card() {
  local title="$1" subtitle="$2" duration="$3" output="$4"
  ffmpeg -y -f lavfi -i color=c=0x0d0d12:s=${W}x${H}:d=${duration}:r=30 \
    -vf "drawtext=fontfile=${FONT}:text='${title}':fontsize=48:fontcolor=0xffffff:x=(w-text_w)/2:y=(h/2)-40,drawtext=fontfile=${FONT_REG}:text='${subtitle}':fontsize=22:fontcolor=0x71717a:x=(w-text_w)/2:y=(h/2)+20" \
    -c:v libx264 -pix_fmt yuv420p -t ${duration} "${output}" 2>/dev/null
}

# Step 3: Create section cards
create_section_card "1. Generation Studio" "Write prompts, select AI models, configure consensus" 8 "${OUTPUT}/sec-studio.png"
echo "Step 3: Studio section card done"

create_section_card "2. Multi-Model Generation" "Multiple AI models generate concurrently via Genblaze SDK" 8 "${OUTPUT}/sec-generate.png"
echo "Step 3: Generation section card done"

create_section_card "3. Gallery & Results" "Browse generations with consensus scores and winner selection" 8 "${OUTPUT}/sec-gallery.png"
echo "Step 3: Gallery section card done"

create_section_card "4. Pipeline Inspector" "Full state machine timeline and candidate comparison" 8 "${OUTPUT}/sec-inspector.png"
echo "Step 3: Inspector section card done"

create_section_card "5. B2 Cloud Storage" "All assets stored on Backblaze B2 with full provenance" 8 "${OUTPUT}/sec-b2.png"
echo "Step 3: B2 section card done"

# Step 4: Create feature highlight cards for padding
create_section_card "Consensus State Machine" "PENDING > GENERATING > VALIDATING > ADVERSARIAL_CHECK > SELECTING > STORING > COMPLETED" 10 "${OUTPUT}/feat-state-machine.png"
echo "Step 4: State machine card done"

create_section_card "Scoring Algorithm" "50% Quality + 30% Diversity + 20% Adversarial Robustness = Consensus Score" 10 "${OUTPUT}/feat-scoring.png"
echo "Step 4: Scoring card done"

create_section_card "B2 Organization" "jobs/{jobId}/candidates/{model}.png  +  jobs/{jobId}/winner/{model}.png" 10 "${OUTPUT}/feat-b2-org.png"
echo "Step 4: B2 org card done"

# Step 5: Create end card
create_section_card "Built for Backblaze Hackathon 2026" "CVMG — Consensus-Verified Media Generator" 12 "${OUTPUT}/end-card.png"
echo "Step 5: End card done"

echo ""
echo "All cards generated. Building concat file..."

# Step 6: Build the video sequence (targeting ~180 seconds total)
# Each screenshot shown for ~15 seconds with zoompan effect
# Section cards provide transitions

cat > "${OUTPUT}/concat.txt" << 'EOF'
file title.png
duration 15
file sec-studio.png
duration 8
file 01-studio.png
duration 18
file 02-studio-filled.png
duration 18
file sec-generate.png
duration 8
file 01-studio.png
duration 15
file sec-gallery.png
duration 8
file 03-gallery.png
duration 18
file sec-inspector.png
duration 8
file 04-inspector.png
duration 18
file sec-b2.png
duration 8
file 05-b2-storage.png
duration 18
file feat-state-machine.png
duration 15
file feat-scoring.png
duration 15
file feat-b2-org.png
duration 15
file sec-b2.png
duration 8
file 05-b2-storage.png
duration 12
file end-card.png
duration 12
file end-card.png
EOF

echo "Building video from ${OUTPUT}/concat.txt..."

# Step 7: Concatenate all clips into final video with fade transitions
cd "${OUTPUT}"
ffmpeg -y -f concat -safe 0 -i concat.txt \
  -vf "fps=30,format=yuv420p" \
  -c:v libx264 -preset medium -crf 23 \
  -movflags +faststart \
  /home/z/my-project/download/demo-media/cvmg-demo.mp4 2>&1 | tail -5

echo ""
echo "Video build complete!"
ls -lh /home/z/my-project/download/demo-media/cvmg-demo.mp4