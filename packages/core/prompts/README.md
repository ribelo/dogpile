# Dogpile Prompts

This directory contains AI prompts used for dog data processing and content generation.

## Structure

- `text-extraction.md`: Extracts structured data from raw shelter descriptions.
- `photo-analysis.md`: Analyzes physical traits from dog photos.
- `description-gen.md`: Generates empathy-driven dog bios in the Dogpile style.

## Rules

- **Language**: Prompt content is in Polish to ensure high-quality Polish output/analysis.
- **Variables**: Uses `{{VARIABLE_NAME}}` syntax for templating.
- **Schema**: Variable names and instructions reference English field names for consistency with the codebase.

## Loading

Prompts should be loaded as raw text and processed using a simple template engine or string replacement.
