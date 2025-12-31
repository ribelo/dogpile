# Image Generation Prompts

This directory contains JSON prompt templates for AI-generated dog portraits.

## Files

- `image-professional.json` - Professional studio portrait prompt
- `image-fun-nose.json` - Fun fisheye "big nose" selfie-style prompt

## Design Decisions

### Two Photo Types Per Dog

We generate two distinct photos for each dog:

1. **Professional Portrait** (`{fingerprint}-professional.png`)
   - Studio ID photo style
   - 85mm portrait lens simulation
   - Three-point lighting setup
   - Head, neck, and upper chest framing
   - Friendly, approachable expression

2. **Fun Nose Photo** (`{fingerprint}-nose.png`)
   - Fisheye/wide-angle selfie style
   - 10mm ultra-wide lens simulation
   - Exaggerated snout/nose (big nose effect)
   - Playful, goofy expression
   - Dog appears to be sniffing the camera

### Aspect Ratio: 4:5 (Portrait)

We use **4:5 aspect ratio** for all generated images. This was chosen because:

- **Dog physiology**: Dogs are vertically oriented when sitting; 4:5 captures head, ears (even tall ones), and upper chest without excess side space
- **Social media native**: Instagram and Facebook feed maximum vertical size (1080x1350)
- **Mobile-first**: Occupies maximum screen real estate on mobile devices
- **Web layout balance**: Distinct portrait feel without being too tall
- **Cropping safety**: Center crop to 1:1 square rarely loses critical information

### Background Color: Warm Cream (#fbf8f3)

Both photo types use the same background:

- **Color**: Warm cream / off-white
- **Hex**: `#fbf8f3`
- **Rationale**: 
  - Warm and inviting feel
  - Professional studio look
  - Works well with all dog coat colors
  - Consistent branding across all generated images

## Prompt Structure

Both prompts use a structured JSON format with sections:

- `meta` - Task description and style reference
- `subject` - Dog description (injected at runtime), positioning, expression
- `photography` - Camera gear, lighting, texture settings
- `background` - Color and atmosphere

The `{{DOG_DESCRIPTION}}` placeholder in the JSON is replaced at runtime with the dog's generated bio.

## Modifying Prompts

To adjust the generated photo style:

1. Edit the JSON files directly
2. No code changes required
3. Changes take effect on next photo generation

Key adjustable parameters:

- `subject.expression` - Dog's mood/expression
- `photography.lighting` - Lighting setup
- `photography.camera_gear.lens` - Lens simulation
- `background.hex_code` - Background color
- `background.atmosphere` - Overall mood
